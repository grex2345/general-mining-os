/**
 * Arena PC Control — real end-to-end integration test (Node.js).
 *
 * Boots the REAL extension (background service worker + manifest content
 * scripts) in a jsdom-simulated Arena.ai tab and drives it against a REAL local
 * Bridge + built-in MCP server on Windows/Linux:
 *
 *   simulated Arena tab (content script) → background worker → Bridge → MCP → OS
 *
 * tests/test_extension_e2e.py starts the Bridge and passes:
 *   APC_TEST_BRIDGE_PORT, APC_TEST_BRIDGE_TOKEN, APC_TEST_WORKDIR
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import vm from "node:vm";

import {
  depsAvailable,
  loadJsdomModule,
  loadWsModule,
  buildArenaPage,
  installPolyfills,
  installLayoutEmulation,
  createBus,
  chromeForContentScript,
  createBackgroundContext,
  deliverToBackground,
  injectContentScripts,
  appendAssistantTurn,
  appendUserTurn,
  readExtFile,
  readManifest,
  waitFor,
  sleep,
} from "./harness/extension_harness.mjs";

const PORT = Number(process.env.APC_TEST_BRIDGE_PORT || 0);
const TOKEN = process.env.APC_TEST_BRIDGE_TOKEN || "";
const WORKDIR = process.env.APC_TEST_WORKDIR || "";
const SKIP = !PORT || !TOKEN || !WORKDIR || !depsAvailable();

// Everything a test boots is registered here and torn down afterwards, so the
// Node test runner can exit instead of hanging on jsdom/worker timers.
const cleanups = [];
after(() => {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  cleanups.length = 0;
});

/** Boot background worker + one content-script tab. */
async function boot({ withComposer = true, composer = "textarea" } = {}) {
  const JSDOMmod = await loadJsdomModule();
  const WebSocketImpl = await loadWsModule();

  const page = buildArenaPage(JSDOMmod, { withComposer, composer });
  const window = page.window;
  installPolyfills(window);
  installLayoutEmulation(window);
  window.alert = (msg) => {
    window.__alerts = window.__alerts || [];
    window.__alerts.push(String(msg));
  };

  const bus = createBus();
  bus.storage.set("bridgePort", PORT);
  bus.storage.set("authToken", TOKEN);
  bus.tabs.push(1);

  // Background service worker (its own VM context, like a worker realm).
  const bg = createBackgroundContext(bus, WebSocketImpl);
  cleanups.push(() => {
    try {
      bg.__shutdown();
    } catch {
      /* ignore */
    }
    try {
      window.close();
    } catch {
      /* ignore */
    }
  });

  // Content scripts share the page realm and run in manifest order.
  const manifest = readManifest();
  const scripts = manifest.content_scripts[0].js;
  window.chrome = chromeForContentScript(bus, 1);

  const sent = [];
  const form = window.document.querySelector("form");
  if (form) {
    const btn = form.querySelector('button[aria-label*="Send" i]');
    btn.addEventListener("click", () => {
      const ta = form.querySelector("textarea");
      if (ta) {
        sent.push(ta.value);
        ta.value = ""; // Arena clears the composer after accepting a message
        return;
      }
      const editor = form.querySelector('[contenteditable="true"]');
      // Capture before clearing: `innerHTML = ""` can leave innerText stale.
      sent.push(editor.innerText !== undefined ? editor.innerText : editor.textContent || "");
      editor.textContent = ""; // Arena clears the editor after accepting
    });
  }

  injectContentScripts(window, scripts);
  if (window.__arenaPC) window.__arenaPC.boot();

  const api = (message) => deliverToBackground(bus, message, { tab: { id: 1 } });

  return { window, bus, bg, sent, api, manifest, scripts };
}

test("manifest ships only valid classic content scripts", () => {
  const manifest = readManifest();
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("storage"));
  const scripts = manifest.content_scripts[0].js;
  assert.deepEqual(scripts[scripts.length - 1], "arena_adapter.js", "adapter must load last");

  for (const file of scripts) {
    const code = readExtFile(file);
    // Chrome injects these as Scripts (classic). Top-level await/import throws.
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: file }),
      `${file} must be valid classic JS (no top-level await/import)`
    );
  }
});

test("extension uses no removed or unpermitted chrome APIs", () => {
  const manifest = readManifest();
  const files = [
    "background.js",
    "arena_adapter.js",
    "popup.js",
    ...manifest.content_scripts[0].js,
  ];
  for (const file of files) {
    const code = readExtFile(file);
    assert.ok(!code.includes("chrome.extension.getURL"), `${file}: chrome.extension.getURL was removed`);
    assert.ok(!code.includes("chrome.extension.sendMessage"), `${file}: chrome.extension.sendMessage was removed`);
    if (!manifest.permissions.includes("scripting")) {
      assert.ok(!code.includes("chrome.scripting"), `${file}: chrome.scripting needs the "scripting" permission`);
    }
    if (!manifest.permissions.includes("tabs")) {
      assert.ok(!code.includes("chrome.tabs.sendMessage"), `${file}: chrome.tabs needs the "tabs" permission`);
    }
  }
});

test("background worker connects, authenticates, and exposes the MCP catalog", { skip: SKIP }, async () => {
  const { api } = await boot({ withComposer: false });

  const state = await waitFor(
    async () => {
      const st = await api({ action: "get_state" });
      return st && st.authenticated ? st : null;
    },
    { label: "authenticated bridge state", timeout: 25000 }
  );

  assert.equal(state.connected, true);
  assert.equal(state.authenticated, true, `auth failed: ${state.lastAuthError}`);
  assert.ok(state.toolCount >= 15, `expected >=15 MCP tools, got ${state.toolCount}`);
  assert.ok(state.tools.includes("fs_write"));
  assert.ok(state.servers.some((s) => s.id === "local_pc" && s.running));
});

test("dock appears in the Arena page and reports paired status", { skip: SKIP }, async () => {
  const { window } = await boot();

  const dock = await waitFor(() => window.document.querySelector(".apc-dock"), {
    label: "dock",
    timeout: 15000,
  });
  assert.match(dock.textContent, /Arena PC Control/);

  await waitFor(() => /Ready|MCP tools/.test(dock.textContent), {
    label: "paired dock status",
    timeout: 25000,
  });
  assert.equal(window.document.querySelector(".apc-dot").classList.contains("apc-dot-online"), true);
});

test("full agent loop: tool block → Windows/OS execution → observation", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot();

  await waitFor(async () => {
    const st = await api({ action: "get_state" });
    return st && st.authenticated;
  }, { label: "authenticated", timeout: 25000 });

  // Start the session from the dock button (exactly what a user clicks).
  const btn = window.document.querySelector(".apc-btn");
  assert.ok(btn, "dock start button");
  btn.click();

  await waitFor(() => sent.length >= 1, { label: "bootstrap prompt", timeout: 20000 });
  assert.match(sent[0], /ARENA-PC-SESSION-INIT/);
  assert.match(sent[0], /fs_write/, "bootstrap must list the MCP tools");

  // The agent replies (allowing a plain user turn, like Arena renders).
  const target = path.join(WORKDIR, "e2e_round_trip.txt");
  appendAssistantTurn(
    window,
    "Sure, writing that now.\n\n```json\n@@@ARENA_PC@@@\n" +
      JSON.stringify({ tool: "fs_write", arguments: { path: target, content: "round trip ok" } }) +
      "\n@@@END_ARENA_PC@@@\n```"
  );

  await waitFor(() => sent.length >= 2, { label: "observation prompt", timeout: 40000 });
  assert.match(sent[1], /\[OBSERVATION — fs_write — SUCCESS\]/);
  assert.equal(fs.readFileSync(target, "utf8"), "round trip ok");

  // Reading the file back through the agent loop must return real content.
  appendAssistantTurn(
    window,
    "@@@ARENA_PC@@@\n" +
      JSON.stringify({ tool: "fs_read", arguments: { path: target } }) +
      "\n@@@END_ARENA_PC@@@"
  );
  await waitFor(() => sent.length >= 3, { label: "fs_read observation", timeout: 40000 });
  assert.match(sent[2], /\[OBSERVATION — fs_read — SUCCESS\]/);
  assert.match(sent[2], /round trip ok/);
});

test("CONFIRM-tier tool surfaces Approve/Deny and executes only when approved", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot();

  await waitFor(async () => {
    const st = await api({ action: "get_state" });
    return st && st.authenticated;
  }, { label: "authenticated", timeout: 25000 });

  window.document.querySelector(".apc-btn").click();
  await waitFor(() => sent.length >= 1, { label: "bootstrap", timeout: 20000 });

  appendAssistantTurn(
    window,
    "@@@ARENA_PC@@@\n" +
      JSON.stringify({ tool: "shell_exec", arguments: { command: "echo APC_APPROVED; echo done" } }) +
      "\n@@@END_ARENA_PC@@@"
  );

  // 1. Card must appear; nothing runs before a decision.
  const denyBtn = await waitFor(() => window.document.querySelector(".apc-btn-deny"), {
    label: "approval card",
    timeout: 30000,
  });
  assert.match(
    window.document.querySelector(".apc-approval-code").textContent,
    /shell_exec/
  );
  denyBtn.click();
  await waitFor(() => sent.length >= 2, { label: "denied observation", timeout: 30000 });
  assert.match(sent[1], /\[OBSERVATION — shell_exec — ERROR\]/);
  assert.match(sent[1], /DENIED|not approved/i);
  // The observation echoes the requested command, so assert that no command
  // *output* came back: a real shell result always carries exit_code/stdout.
  assert.doesNotMatch(sent[1], /"exit_code"/, "denied command must not have executed");
  assert.doesNotMatch(sent[1], /"stdout"/, "denied command must not have produced output");

  // 2. Same call again, this time approved → it runs and returns stdout.
  appendAssistantTurn(
    window,
    "@@@ARENA_PC@@@\n" +
      JSON.stringify({ tool: "shell_exec", arguments: { command: "echo APC_APPROVED_2; echo done" } }) +
      "\n@@@END_ARENA_PC@@@"
  );
  const approveBtn = await waitFor(() => window.document.querySelector(".apc-btn-approve"), {
    label: "second approval card",
    timeout: 30000,
  });
  approveBtn.click();
  await waitFor(() => sent.length >= 3, { label: "approved observation", timeout: 40000 });
  assert.match(sent[2], /\[OBSERVATION — shell_exec — SUCCESS\]/);
  assert.match(sent[2], /APC_APPROVED_2/);
});

test("malformed agent output triggers a self-correction prompt, not a hang", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot();

  await waitFor(async () => {
    const st = await api({ action: "get_state" });
    return st && st.authenticated;
  }, { label: "authenticated", timeout: 25000 });

  window.document.querySelector(".apc-btn").click();
  await waitFor(() => sent.length >= 1, { label: "bootstrap", timeout: 20000 });

  appendAssistantTurn(window, "@@@ARENA_PC@@@\n{\"tool\": \"fs_read\", BROKEN}\n@@@END_ARENA_PC@@@");
  await waitFor(() => sent.length >= 2, { label: "correction prompt", timeout: 30000 });
  assert.match(sent[1], /SYSTEM FEEDBACK/);
  assert.match(sent[1], /could not be parsed/i);
  // Session must still be alive so the agent can retry.
  assert.equal(window.__arenaPC.state().sessionActive, true);
});

test("agent final answers are never re-executed or corrupted", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot();

  await waitFor(async () => {
    const st = await api({ action: "get_state" });
    return st && st.authenticated;
  }, { label: "authenticated", timeout: 25000 });

  window.document.querySelector(".apc-btn").click();
  await waitFor(() => sent.length >= 1, { label: "bootstrap", timeout: 20000 });

  appendAssistantTurn(window, "All done! I created the file for you.");
  appendUserTurn(window, "thanks");
  await sleep(2500);
  assert.equal(sent.length, 1, "a final answer must not produce an outbound message");
  assert.equal(window.__arenaPC.state().sessionActive, true);
});

test("streaming (unclosed) tool blocks are not executed prematurely", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot();

  await waitFor(async () => {
    const st = await api({ action: "get_state" });
    return st && st.authenticated;
  }, { label: "authenticated", timeout: 25000 });

  window.document.querySelector(".apc-btn").click();
  await waitFor(() => sent.length >= 1, { label: "bootstrap", timeout: 20000 });

  const target = path.join(WORKDIR, "streaming.txt");
  appendAssistantTurn(
    window,
    "@@@ARENA_PC@@@\n" + JSON.stringify({ tool: "fs_write", arguments: { path: target, content: "partial" } })
  );
  await sleep(2500);
  assert.equal(sent.length, 1, "incomplete block must not be executed");
  assert.equal(fs.existsSync(target), false);

  // The stream finishes → now it runs.
  window.document.querySelector("ol.flex-col-reverse").firstChild.querySelector(".prose").textContent +=
    "\n@@@END_ARENA_PC@@@";
  await waitFor(() => sent.length >= 2, { label: "completed block observation", timeout: 40000 });
  assert.equal(fs.readFileSync(target, "utf8"), "partial");
});

test("stopping the session from the dock halts the loop", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot();

  await waitFor(async () => {
    const st = await api({ action: "get_state" });
    return st && st.authenticated;
  }, { label: "authenticated", timeout: 25000 });

  const btn = window.document.querySelector(".apc-btn");
  btn.click();
  await waitFor(() => sent.length >= 1, { label: "bootstrap", timeout: 20000 });
  assert.equal(btn.textContent, "Stop PC Session");

  btn.click();
  await waitFor(() => btn.textContent === "Start PC Session", { label: "session stopped" });
  assert.equal(window.__arenaPC.state().sessionActive, false);

  appendAssistantTurn(
    window,
    "@@@ARENA_PC@@@\n" + JSON.stringify({ tool: "system_info", arguments: {} }) + "\n@@@END_ARENA_PC@@@"
  );
  await sleep(2500);
  assert.equal(sent.length, 1, "no execution after the session is stopped");
});

test("bridge restart heals the extension connection automatically", { skip: SKIP }, async () => {
  // The Python driver restarts the bridge between two phases; this test only
  // asserts that the current connection reports healthy after a reconnect.
  const { api } = await boot({ withComposer: false });
  const st = await waitFor(
    async () => {
      const s = await api({ action: "get_state" });
      return s && s.authenticated ? s : null;
    },
    { label: "re-auth", timeout: 30000 }
  );
  assert.equal(st.authenticated, true);
});

test("two Arena tabs: each session stays isolated and approvals hit the right tab", { skip: SKIP }, async () => {
  const { bootExtensionTabs } = await import("./harness/extension_harness.mjs");
  const { bg: worker, pages } = await bootExtensionTabs(2);
  const [tabA, tabB] = pages;
  cleanups.push(() => {
    worker.__shutdown();
    for (const p of pages) p.window.close();
  });

  // Wait until both tabs see the same paired bridge.
  for (const page of pages) {
    await waitFor(
      () => page.window.__arenaPC && page.window.__arenaPC.state().bridgeState.authenticated,
      { label: `tab ${page.tabId} authenticated`, timeout: 30000 }
    );
  }

  // Start a PC session in BOTH tabs.
  tabA.window.document.querySelector(".apc-btn").click();
  tabB.window.document.querySelector(".apc-btn").click();
  await waitFor(() => tabA.sent.length >= 1 && tabB.sent.length >= 1, {
    label: "both bootstraps",
    timeout: 30000,
  });

  const sessionA = tabA.window.__arenaPC.state().bridgeSessionId;
  const sessionB = tabB.window.__arenaPC.state().bridgeSessionId;
  assert.ok(sessionA && sessionB);
  assert.notEqual(sessionA, sessionB, "each tab must own its own bridge session");

  // Tab B asks for a CONFIRM-tier action. Only tab B may show the card.
  const marker = path.join(WORKDIR, "tab_b_only.txt");
  appendAssistantTurn(
    tabB.window,
    "@@@ARENA_PC@@@\n" +
      JSON.stringify({
        tool: "fs_write",
        arguments: { path: path.join(os.tmpdir(), "apc_outside_tab_b.txt"), content: "b" },
      }) +
      "\n@@@END_ARENA_PC@@@"
  );
  const approveB = await waitFor(() => tabB.window.document.querySelector(".apc-btn-approve"), {
    label: "approval card in tab B",
    timeout: 30000,
  });
  assert.equal(
    tabA.window.document.querySelector(".apc-btn-approve"),
    null,
    "tab A must not receive tab B's approval prompt"
  );
  approveB.click();

  await waitFor(() => tabB.sent.length >= 2, { label: "tab B observation", timeout: 40000 });
  assert.match(tabB.sent[1], /\[OBSERVATION — fs_write — SUCCESS\]/);
  assert.equal(tabA.sent.length, 1, "tab A must stay silent while tab B works");

  // Tab A executes its own tool and its result must be attributed to session A.
  appendAssistantTurn(
    tabA.window,
    "@@@ARENA_PC@@@\n" + JSON.stringify({ tool: "system_info", arguments: {} }) + "\n@@@END_ARENA_PC@@@"
  );
  await waitFor(() => tabA.sent.length >= 2, { label: "tab A observation", timeout: 40000 });
  assert.match(tabA.sent[1], /\[OBSERVATION — system_info — SUCCESS\]/);
  assert.equal(tabB.sent.length, 2, "tab B must not receive tab A's observation");
  void marker;
});

test("contenteditable composer: prompts are delivered when Arena drops the textarea", { skip: SKIP }, async () => {
  const { window, sent, api } = await boot({ composer: "contenteditable" });
  const doc = window.document;
  assert.equal(doc.querySelector("form textarea"), null, "fixture must have no textarea");

  await waitFor(
    () => window.__arenaPC && window.__arenaPC.state().bridgeState.authenticated,
    { label: "worker authenticated", timeout: 30000 }
  );
  await waitFor(() => doc.querySelector(".apc-btn"), { label: "dock mounted", timeout: 20000 });
  doc.querySelector(".apc-btn").click();

  await waitFor(() => sent.length >= 1, { label: "bootstrap prompt", timeout: 30000 });
  assert.match(sent[0], /@@@ARENA_PC@@@/);
  assert.match(sent[0], /fs_write|system_info/, "the tool catalog must reach the agent");
});

test("two approval requests queue up and each shows a countdown", { skip: SKIP }, async () => {
  const { window, sent, bus } = await boot();
  const doc = window.document;
  await waitFor(
    () => window.__arenaPC && window.__arenaPC.state().bridgeState.authenticated,
    { label: "authenticated", timeout: 30000 }
  );
  doc.querySelector(".apc-btn").click();
  await waitFor(() => sent.length >= 1, { label: "bootstrap", timeout: 30000 });

  // Deliver exactly what background.js sends to the tab for an approval.
  const pushApproval = (id, file) => {
    const payload = {
      type: "approval_required",
      approval: {
        id,
        tool: "fs_write",
        arguments: { path: file, content: "x" },
        reason: "Outside allowed workspace roots.",
        riskCategory: "filesystem",
        timeoutSeconds: 5,
      },
    };
    const listeners = bus.tabListeners.get(1) || [];
    for (const fn of listeners) fn(payload, {}, () => {});
  };

  pushApproval("a1", "C:/one.txt");
  pushApproval("a2", "C:/two.txt");

  const card = await waitFor(() => doc.querySelector(".apc-approval-code"), {
    label: "first approval card",
    timeout: 20000,
  });
  assert.match(card.textContent, /C:\/one\.txt/, "the first request must be shown first");
  const timer = doc.querySelector(".apc-approval-timer");
  assert.match(timer.textContent, /5s to decide/);

  // The countdown must actually tick down (no frozen card) ...
  const firstValue = Number(timer.textContent.match(/(\d+)s/)[1]);
  await waitFor(() => Number(doc.querySelector(".apc-approval-timer").textContent.match(/(\d+)s/)[1]) < firstValue, {
    label: "countdown ticking",
    timeout: 5000,
  });
  // ... and mention the request waiting behind this one.
  assert.match(doc.querySelector(".apc-approval-timer").textContent, /1 more waiting/);

  // Denying the first must reveal the second, not drop it.
  doc.querySelector(".apc-btn-deny").click();
  const second = await waitFor(
    () => {
      const el = doc.querySelector(".apc-approval-code");
      return el && /C:\/two\.txt/.test(el.textContent) ? el : null;
    },
    { label: "second approval card", timeout: 20000 }
  );
  assert.ok(second);
  assert.equal(window.__arenaPC.state().sessionActive, true, "the session must survive a denial");
  doc.querySelector(".apc-btn-deny").click();
  await waitFor(() => doc.querySelector(".apc-approval-code") === null, {
    label: "queue drained",
    timeout: 10000,
  });
});
