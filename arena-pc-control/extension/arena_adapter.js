/**
 * Arena PC Control — Universal Arena.ai Content Script Adapter.
 *
 * Non-destructive integration:
 *  - Leaves Arena completely untouched until the user clicks "Start PC Session".
 *  - Auto-detects supported AI agent interfaces through the provider adapters
 *    (`providers/*.js`, loaded as classic scripts via the manifest).
 *  - Renders a compact dock above the Arena chat input showing live status.
 *  - Displays an explicit Approve / Deny card for every CONFIRM-tier action.
 *  - Owns the agent loop: watch the agent's turns, execute tool blocks through
 *    the background worker → Bridge → MCP → Windows, and feed observations back.
 *
 * IMPORTANT: Manifest V3 injects this file as a *classic* content script.
 * Never use top-level `await`, `import`, or `export` here — Chrome rejects the
 * whole script with a SyntaxError and the extension silently does nothing.
 */
(() => {
  "use strict";

  const Protocol = globalThis.ArenaPCProtocol;
  const Providers = globalThis.ArenaPCProviders || {};

  if (!Protocol) {
    console.error("[Arena PC Control] protocol.js missing — content script disabled.");
    return;
  }
  if (!Providers.ArenaDirectAdapter) {
    console.error("[Arena PC Control] providers/arena_direct.js missing — content script disabled.");
    return;
  }

  // ── Tunables ────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 900;
  const DOCK_REFRESH_MS = 2000;
  const STATE_REFRESH_MS = 3000;
  const MAX_CONSECUTIVE_ERRORS = 4;
  const KEEPALIVE_MS = 20000;
  const TOOL_TIMEOUT_SECONDS = 120;

  // Provider adapters are tried in order; the first one that detects the page wins.
  const ADAPTER_CLASSES = [Providers.ArenaDirectAdapter];

  // ── Runtime state ───────────────────────────────────────────────────
  let sessionActive = false;
  let busyExecuting = false;
  let consecutiveErrors = 0;
  let bridgeSessionId = null;
  let activeAdapter = null;
  let keepAliveTimer = null;
  let pendingApprovals = 0;

  const actionedTurnKeys = new Set();
  const promptQueue = [];
  let draining = false;

  let lastSendAt = 0;
  let lastAgentTurnAt = 0;

  let bridgeState = {
    connected: false,
    authenticated: false,
    lastAuthError: "",
    toolCount: 0,
    servers: [],
  };

  // ── Messaging ───────────────────────────────────────────────────────
  function sendToBackground(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const err = chrome.runtime.lastError;
          if (err) resolve({ ok: false, error: err.message });
          else resolve(response);
        });
      } catch (err) {
        resolve({ ok: false, error: String(err) });
      }
    });
  }

  // ── Prompt queue ────────────────────────────────────────────────────
  // A single serialized queue guarantees we never interleave two Arena prompts
  // and never wedge the agent loop when the send button is temporarily disabled.
  function enqueuePrompt(text, images = []) {
    if (!text || !String(text).trim()) return;
    promptQueue.push({ text: String(text), images: images || [] });
    void drainQueue();
  }

  async function drainQueue() {
    if (draining) return;
    draining = true;
    try {
      while (promptQueue.length > 0 && sessionActive) {
        const item = promptQueue[0];
        if (!activeAdapter) break;
        if (activeAdapter.isGenerating && activeAdapter.isGenerating()) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        const ok = await activeAdapter.sendPrompt(item.text, { images: item.images });
        if (!ok) {
          setStatus("Could not reach the Arena composer — click the chat box, then retry.");
          promptQueue.length = 0;
          break;
        }
        promptQueue.shift();
        lastSendAt = Date.now();
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      console.error("[Arena PC Control] send failed:", err);
    } finally {
      draining = false;
    }
  }

  /**
   * Pull the worker's current bridge state. Needed (not just nice to have)
   * because `bridge_state` is broadcast only on change: a tab opened before the
   * bridge was paired — or before the extension worker reconnected — would
   * otherwise show "not paired" forever.
   */
  async function refreshBridgeState() {
    const st = await sendToBackground({ action: "get_state" });
    if (st && typeof st === "object" && "connected" in st) {
      const changed =
        st.connected !== bridgeState.connected ||
        st.authenticated !== bridgeState.authenticated ||
        st.toolCount !== bridgeState.toolCount ||
        st.lastAuthError !== bridgeState.lastAuthError;
      bridgeState = st;
      if (changed) renderDockState();
      else if (!dockEl) mountDock();
    }
  }

  function startKeepAlive() {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
      if (!sessionActive) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
        return;
      }
      sendToBackground({ action: "get_state" }).then((st) => {
        if (st && typeof st === "object" && "connected" in st) {
          bridgeState = st;
          renderDockState();
        }
      });
    }, KEEPALIVE_MS);
  }

  // ── Adapter detection ───────────────────────────────────────────────
  function detectAdapter() {
    for (const AdapterClass of ADAPTER_CLASSES) {
      try {
        const candidate = new AdapterClass();
        if (candidate.detect()) {
          activeAdapter = candidate;
          activeAdapter.startSession();
          sendToBackground({
            action: "register_adapter",
            adapterName: candidate.name,
            provider: candidate.provider,
          });
          return activeAdapter;
        }
      } catch (err) {
        console.warn("[Arena PC Control] adapter detection failed:", err);
      }
    }
    activeAdapter = null;
    return null;
  }

  // ── UI: dock + approval card ────────────────────────────────────────
  let dockEl = null;
  let statusDotEl = null;
  let statusTextEl = null;
  let toggleBtnEl = null;
  let approvalBoxEl = null;

  function setStatus(text) {
    if (statusTextEl) statusTextEl.textContent = text;
  }

  function mountDock() {
    if (dockEl && document.body && document.body.contains(dockEl)) return true;
    const form = document.querySelector("form");
    if (!form || !form.parentElement) return false;

    dockEl = document.createElement("div");
    dockEl.className = "apc-dock";
    dockEl.setAttribute("role", "region");
    dockEl.setAttribute("aria-label", "Arena PC Control");

    const row = document.createElement("div");
    row.className = "apc-row";

    statusDotEl = document.createElement("span");
    statusDotEl.className = "apc-dot apc-dot-offline";

    const title = document.createElement("span");
    title.className = "apc-title";
    title.textContent = "Arena PC Control";

    statusTextEl = document.createElement("span");
    statusTextEl.className = "apc-status";
    statusTextEl.textContent = "Checking bridge…";

    toggleBtnEl = document.createElement("button");
    toggleBtnEl.type = "button";
    toggleBtnEl.className = "apc-btn apc-btn-primary";
    toggleBtnEl.textContent = "Start PC Session";
    toggleBtnEl.addEventListener("click", () => {
      toggleBtnEl.disabled = true;
      onToggleSession()
        .catch((err) => console.error("[Arena PC Control]", err))
        .finally(() => {
          toggleBtnEl.disabled = false;
        });
    });

    approvalBoxEl = document.createElement("div");
    approvalBoxEl.className = "apc-approval";
    approvalBoxEl.hidden = true;

    row.append(statusDotEl, title, statusTextEl, toggleBtnEl);
    dockEl.append(row, approvalBoxEl);
    form.parentElement.insertBefore(dockEl, form);
    renderDockState();
    return true;
  }

  function renderDockState() {
    if (!dockEl || !statusTextEl) return;
    statusDotEl.className = "apc-dot";

    if (!bridgeState.connected) {
      statusDotEl.classList.add("apc-dot-offline");
      statusTextEl.textContent = "Bridge offline — run scripts/start.bat";
    } else if (!bridgeState.authenticated) {
      statusDotEl.classList.add("apc-dot-warn");
      statusTextEl.textContent =
        bridgeState.lastAuthError || "Paste the pairing token in the extension popup";
    } else if (pendingApprovals > 0) {
      statusDotEl.classList.add("apc-dot-warn");
      statusTextEl.textContent = `${pendingApprovals} action(s) awaiting your approval`;
    } else {
      statusDotEl.classList.add("apc-dot-online");
      const label = sessionActive ? "PC Control Active" : "Ready";
      statusTextEl.textContent =
        `${label} • ${bridgeState.toolCount} MCP tools • ${activeAdapter ? activeAdapter.name : "detecting…"}`;
    }

    toggleBtnEl.textContent = sessionActive ? "Stop PC Session" : "Start PC Session";
    toggleBtnEl.className = sessionActive ? "apc-btn apc-btn-stop" : "apc-btn apc-btn-primary";
  }

  function removeApprovalCard() {
    if (!approvalBoxEl) return;
    approvalBoxEl.hidden = true;
    approvalBoxEl.textContent = "";
    pendingApprovals = 0;
    renderDockState();
  }

  function showApprovalCard(approval) {
    mountDock();
    if (!approvalBoxEl) return;

    let prettyArgs = "{}";
    try {
      prettyArgs = JSON.stringify(approval.arguments || {}, null, 2);
    } catch {
      prettyArgs = String(approval.arguments);
    }

    pendingApprovals += 1;
    approvalBoxEl.hidden = false;
    approvalBoxEl.textContent = "";

    const header = document.createElement("div");
    header.className = "apc-approval-header";
    const strong = document.createElement("strong");
    strong.textContent = `Permission required (${approval.riskCategory || "action"})`;
    const reason = document.createElement("span");
    reason.textContent = approval.reason || "";
    header.append(strong, reason);

    const pre = document.createElement("pre");
    pre.className = "apc-approval-code";
    pre.textContent = `Tool: ${approval.tool}\n${prettyArgs}`;

    const actions = document.createElement("div");
    actions.className = "apc-approval-actions";
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "apc-btn apc-btn-approve";
    approveBtn.textContent = "Approve Once";
    const denyBtn = document.createElement("button");
    denyBtn.type = "button";
    denyBtn.className = "apc-btn apc-btn-deny";
    denyBtn.textContent = "Deny";
    actions.append(approveBtn, denyBtn);
    approvalBoxEl.append(header, pre, actions);

    const decide = async (approved) => {
      approveBtn.disabled = true;
      denyBtn.disabled = true;
      const res = await sendToBackground({
        action: "approval_decision",
        approvalId: approval.id,
        approved,
      });
      if (res && res.type === "error") {
        setStatus(res.error || "Approval was rejected by the bridge.");
      } else {
        setStatus(approved ? "Approved — executing…" : "Denied by user.");
      }
      removeApprovalCard();
    };
    approveBtn.addEventListener("click", () => void decide(true));
    denyBtn.addEventListener("click", () => void decide(false));

    renderDockState();
  }

  // ── Session lifecycle ───────────────────────────────────────────────
  async function onToggleSession() {
    if (sessionActive) {
      await stopSession("Session stopped by user.");
      return;
    }

    const adapter = detectAdapter();
    if (!adapter) {
      alert("No supported Arena agent interface detected on this page.");
      return;
    }

    const toolsRes = await sendToBackground({ action: "get_bootstrap_tools" });
    if (!toolsRes || !toolsRes.ok) {
      alert((toolsRes && toolsRes.error) || "Bridge is offline or not paired yet.");
      return;
    }

    bridgeSessionId = null;
    const created = await sendToBackground({
      action: "create_session",
      agent_type: "arena_agent",
      provider: adapter.provider,
      metadata: { adapter: adapter.name, url: window.location.href },
    });
    if (!created || !created.session_id) {
      alert((created && created.error) || "Could not create a bridge session.");
      return;
    }
    bridgeSessionId = created.session_id;
    adapter.setBridgeSessionId(bridgeSessionId);

    sessionActive = true;
    consecutiveErrors = 0;
    actionedTurnKeys.clear();
    pendingApprovals = 0;

    // Everything already on screen is context, never an instruction to replay.
    for (const turn of adapter.collectTurns()) actionedTurnKeys.add(turn.key);

    startKeepAlive();
    renderDockState();

    const conv = adapter.identifyConversation() || {};
    const notes = `Connected via ${adapter.name} adapter. Conversation: ${conv.title || "Arena.ai"}`;
    enqueuePrompt(Protocol.buildBootstrapPrompt(toolsRes.tools || [], notes));
  }

  async function stopSession(reason) {
    if (bridgeSessionId) {
      await sendToBackground({ action: "close_session", session_id: bridgeSessionId }).catch(() => {});
    }
    sessionActive = false;
    bridgeSessionId = null;
    promptQueue.length = 0;
    if (activeAdapter && activeAdapter.endSession) activeAdapter.endSession();
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    removeApprovalCard();
    setStatus(reason || "Session stopped.");
    renderDockState();
  }

  // ── Agent loop ──────────────────────────────────────────────────────
  function onAssistantTurn(turn) {
    const outcome = Protocol.extractAction(turn.text);

    if (outcome.kind === "final_answer") {
      consecutiveErrors = 0;
      if (!busyExecuting && promptQueue.length === 0) {
        setStatus("Idle — the agent replied. Waiting for its next instruction.");
      }
      return;
    }

    if (outcome.kind === "multi_error" || outcome.kind === "parse_error") {
      consecutiveErrors += 1;
      if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
        void stopSession("Agent kept emitting invalid tool blocks — session stopped.");
        return;
      }
      enqueuePrompt(Protocol.buildCorrectionPrompt(outcome));
      return;
    }

    void executeToolAndReport(outcome);
  }

  async function executeToolAndReport(outcome) {
    busyExecuting = true;
    setStatus(`Running ${outcome.tool}…`);

    let result;
    try {
      result = await sendToBackground({
        action: "call_tool",
        tool: outcome.tool,
        arguments: outcome.arguments || {},
        timeout: TOOL_TIMEOUT_SECONDS,
        session_id: bridgeSessionId,
        correlation_id: bridgeSessionId
          ? `${bridgeSessionId}:${Date.now().toString(36)}`
          : undefined,
      });
    } catch (err) {
      result = { ok: false, text: `Extension error: ${(err && err.message) || err}`, images: [] };
    }

    if (!result || typeof result !== "object") {
      result = { ok: false, text: "No response from the local bridge.", images: [] };
    }

    if (result.ok) {
      consecutiveErrors = 0;
    } else {
      consecutiveErrors += 1;
    }

    if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
      busyExecuting = false;
      await stopSession("Too many consecutive tool failures — session stopped.");
      return;
    }

    const observation = Protocol.formatToolObservation(outcome.tool, result);
    busyExecuting = false;
    enqueuePrompt(observation, Array.isArray(result.images) ? result.images : []);
    renderDockState();
  }

  function pollAgent() {
    try {
      if (!sessionActive || !activeAdapter) return;
      if (busyExecuting || draining || promptQueue.length > 0) return;

      const turns = activeAdapter.collectTurns();
      const fresh = turns.filter((t) => !actionedTurnKeys.has(t.key));
      if (fresh.length === 0) return;

      // Mark every fresh turn as seen; act only on the newest one. Older turns
      // are context that arrived between polls (bootstrap reply, etc.).
      for (const t of fresh) actionedTurnKeys.add(t.key);
      const latest = fresh[fresh.length - 1];

      // Never parse a turn that is still streaming (no closing fence yet).
      if (Protocol.isStreamingIncomplete(latest.text)) {
        actionedTurnKeys.delete(latest.key);
        return;
      }
      if (activeAdapter.isGenerating && activeAdapter.isGenerating()) {
        actionedTurnKeys.delete(latest.key);
        return;
      }
      // Debounce: wait until the turn content has been stable for one poll.
      if (Date.now() - lastAgentTurnAt < POLL_INTERVAL_MS) {
        actionedTurnKeys.delete(latest.key);
        return;
      }

      lastAgentTurnAt = Date.now();
      onAssistantTurn(latest);
    } catch (err) {
      console.error("[Arena PC Control] poll error:", err);
    }
  }

  // ── Bridge state subscription ───────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "bridge_state") {
      bridgeState = msg.state || bridgeState;
      renderDockState();
    } else if (msg.type === "approval_required") {
      showApprovalCard(msg.approval || {});
    }
  });

  // ── Boot ────────────────────────────────────────────────────────────
  function boot() {
    if (!activeAdapter) detectAdapter();
    mountDock();
    void refreshBridgeState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  setInterval(() => {
    if (!dockEl || !document.body.contains(dockEl)) mountDock();
  }, DOCK_REFRESH_MS);

  setInterval(pollAgent, POLL_INTERVAL_MS);
  setInterval(() => {
    void refreshBridgeState();
  }, STATE_REFRESH_MS);

  // Test hooks (harmless in production; used by tests/test_extension_e2e.mjs).
  globalThis.__arenaPC = {
    state: () => ({
      sessionActive,
      bridgeSessionId,
      busyExecuting,
      queued: promptQueue.length,
      bridgeState,
      actionedTurns: actionedTurnKeys.size,
    }),
    boot,
    pollAgent,
    toggleSession: onToggleSession,
  };
})();
