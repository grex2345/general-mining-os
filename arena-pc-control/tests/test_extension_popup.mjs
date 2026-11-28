/**
 * Popup wiring test: popup.html + popup.js against a live bridge.
 *
 * The popup is the only place a user can pair the extension. It previously
 * showed "Offline — run start_windows.bat" even when everything was healthy,
 * because it read the state before the worker finished the handshake and never
 * refreshed. This test drives the real files:
 *
 *   1. load a fresh (unpaired) popup → must report offline/not-paired
 *   2. type port + token, click "Save & Pair Bridge"
 *   3. the popup must flip to "Paired & Ready" with the tool count
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  depsAvailable,
  loadJsdomModule,
  loadWsModule,
  createBus,
  createBackgroundContext,
  readExtFile,
  waitFor,
} from "./harness/extension_harness.mjs";

const PORT = Number(process.env.APC_TEST_BRIDGE_PORT || 0);
const TOKEN = process.env.APC_TEST_BRIDGE_TOKEN || "";
const SKIP = !PORT || !TOKEN || !depsAvailable();

async function openPopup(bus) {
  const JSDOMmod = await loadJsdomModule();
  const JSDOM = JSDOMmod.JSDOM || JSDOMmod;
  const html = readExtFile("popup.html").replace('<script src="popup.js"></script>', "");
  const page = new JSDOM(html, { url: "chrome-extension://apc/popup.html", runScripts: "outside-only" });
  const window = page.window;
  const runtimeListeners = bus.runtimeListeners;
  window.chrome = {
    runtime: {
      id: "apc",
      lastError: undefined,
      sendMessage(message, callback) {
        // Popup → background, exactly like Chrome.
        let settled = false;
        const sendResponse = (resp) => {
          if (settled) return;
          settled = true;
          if (callback) callback(resp);
        };
        for (const fn of runtimeListeners) {
          try {
            fn(message, {}, sendResponse);
          } catch (err) {
            if (callback) callback(undefined);
            void err;
            return;
          }
        }
      },
      onMessage: { addListener() {} },
    },
    storage: {
      local: {
        get(keys, cb) {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (bus.storage.has(k)) out[k] = bus.storage.get(k);
          if (cb) cb(out);
          return Promise.resolve(out);
        },
        set(obj, cb) {
          for (const [k, v] of Object.entries(obj)) bus.storage.set(k, v);
          if (cb) cb();
          return Promise.resolve();
        },
      },
    },
  };
  window.eval(readExtFile("popup.js"));
  return window;
}

test("popup pairs with the live bridge and reports ready", { skip: SKIP }, async () => {
  const WebSocketImpl = await loadWsModule();
  const bus = createBus();
  const bg = createBackgroundContext(bus, WebSocketImpl);

  const window = await openPopup(bus);
  const doc = window.document;
  const status = () => doc.getElementById("statusBox").textContent;

  // Fresh install: no stored credentials → the popup must say so, not "Ready".
  await waitFor(() => /Offline|waiting|pairing token/i.test(status()), {
    label: "unpaired popup status",
    timeout: 20000,
  });

  // Enter the real port + token and click the pairing button.
  doc.getElementById("portInput").value = String(PORT);
  doc.getElementById("tokenInput").value = TOKEN;
  const btn = doc.getElementById("saveBtn");
  btn.click();

  await waitFor(() => /Paired & Ready/.test(status()), {
    label: "popup to report Paired & Ready",
    timeout: 30000,
  });
  assert.match(status(), /MCP tools/);
  assert.equal(bus.storage.get("authToken"), TOKEN);
  assert.equal(Number(bus.storage.get("bridgePort")), PORT);

  // Refresh button must report the catalog size.
  doc.getElementById("refreshBtn").click();
  await waitFor(() => /refreshed: \d+ tools/.test(doc.getElementById("hint").textContent), {
    label: "tool catalog refresh",
    timeout: 30000,
  });

  bg.__shutdown();
  window.close();
});

test("popup surfaces a wrong token instead of pretending to be ready", { skip: SKIP }, async () => {
  const WebSocketImpl = await loadWsModule();
  const bus = createBus();
  const bg = createBackgroundContext(bus, WebSocketImpl);
  const window = await openPopup(bus);
  const doc = window.document;

  doc.getElementById("portInput").value = String(PORT);
  doc.getElementById("tokenInput").value = "definitely_the_wrong_token_1234567890";
  doc.getElementById("saveBtn").click();

  await waitFor(() => /Invalid pairing token|waiting for/i.test(doc.getElementById("statusBox").textContent), {
    label: "auth error surfaced in popup",
    timeout: 30000,
  });
  assert.doesNotMatch(doc.getElementById("statusBox").textContent, /Paired & Ready/);

  bg.__shutdown();
  window.close();
});

