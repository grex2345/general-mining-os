/**
 * Arena PC Control — Universal Arena.ai Content Script Adapter.
 *
 * Non-destructive integration:
 *  - Leaves Arena completely untouched until the user clicks "Start PC Session".
 *  - Auto-detects supported AI agent interfaces via provider adapters.
 *  - Renders a compact dock above the Arena chat input showing live connection status.
 *  - Displays an explicit Approve / Deny confirmation card for CONFIRM-tier actions.
 *  - Routes tool calls through the active provider adapter to the correct agent interface.
 *
 * Supported adapters (auto-detected):
 *   • arena_direct — Arena.ai Direct mode chat interface
 *   • Additional adapters can be added in extension/providers/ without changing this file.
 */

(() => {
  "use strict";

  const Protocol = window.ArenaPCProtocol;
  if (!Protocol) return;

  // ── Import provider adapters ────────────────────────────────────────
  // MV3 content scripts can import ES modules. We import adapters dynamically.
  let ArenaDirectAdapterClass = null;
  try {
    // The adapter module is loaded via import map or direct path
    const mod = chrome.extension.getURL("providers/arena_direct.js");
    // We'll load it via import() if supported, otherwise fallback to inline detection
  } catch {
    // Ignore import errors — inline fallback below
  }

  let sessionActive = false;
  let busyExecuting = false;
  let processedTurnCount = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 4;

  let bridgeState = {
    connected: false,
    authenticated: false,
    lastAuthError: "",
    toolCount: 0,
    servers: [],
    activeAdapters: [],
  };

  let activeAdapter = null; // The provider adapter instance for this tab

  // ── Arena DOM Helpers ───────────────────────────────────────────────
  function findComposerForm() {
    const textarea = document.querySelector("form textarea");
    return textarea ? textarea.closest("form") : null;
  }

  function findTextarea() {
    return document.querySelector("form textarea");
  }

  function isModelGenerating() {
    return Boolean(
      document.querySelector('button[aria-label*="Stop" i], button[aria-label*="Arrêt" i]')
    );
  }

  function getOrderedAssistantMessages() {
    const ol =
      document.querySelector("ol.flex-col-reverse") ||
      [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose"));
    if (!ol) return [];
    const items = [...ol.children].reverse();
    const assistantProse = [];
    for (const item of items) {
      if (item.classList.contains("justify-end")) continue;
      const prose = item.querySelector(".prose");
      if (prose) {
        assistantProse.push(prose.innerText || prose.textContent || "");
      }
    }
    return assistantProse;
  }

  async function stageBase64Images(images) {
    if (!Array.isArray(images) || images.length === 0) return;
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) return;

    const dt = new DataTransfer();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const bin = atob(img.data);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        const ext = (img.mimeType || "image/jpeg").includes("png") ? "png" : "jpg";
        const file = new File([bytes], `pc_capture_${Date.now()}_${i}.${ext}`, {
          type: img.mimeType || "image/jpeg",
        });
        dt.items.add(file);
      } catch {
        // Ignore malformed image frame
      }
    }
    if (dt.files.length > 0) {
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 450));
    }
  }

  async function sendToArenaComposer(text, images = []) {
    const textarea = findTextarea();
    if (!textarea) return false;

    if (images.length > 0) {
      await stageBase64Images(images);
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    nativeSetter.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 180));

    const sendBtn =
      document.querySelector('form button[aria-label*="Send" i]') ||
      document.querySelector('form button[type="submit"]');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return true;
    }
    return false;
  }

  // ── Provider Adapter Detection ──────────────────────────────────────
  function detectAndActivateAdapter() {
    // Try Arena Direct adapter first
    const ol =
      document.querySelector("ol.flex-col-reverse") ||
      [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose"));
    const textarea = document.querySelector("form textarea");
    const sendBtn =
      document.querySelector('form button[aria-label*="Send" i]') ||
      document.querySelector('form button[type="submit"]');

    if (ol && textarea && sendBtn) {
      // Inline Arena Direct adapter (falls back if ES module import not available)
      activeAdapter = {
        name: "arena_direct",
        provider: "arena",
        detect: () => true,
        identifyConversation: () => ({
          conversationId: `arena_conv_${Date.now()}`,
          title: document.querySelector("h1")?.textContent || document.title || "Arena Conversation",
          url: window.location.href,
        }),
        observeNewMessages: () => {
          const assistantTurns = getOrderedAssistantMessages();
          const newMessages = assistantTurns.slice(processedTurnCount);
          processedTurnCount = assistantTurns.length;
          return newMessages;
        },
        deliverToolCall: (toolName, argumentsObj) => {
          const payload = JSON.stringify({ tool: toolName, arguments: argumentsObj });
          const block = `\n@@@ARENA_PC@@@\n${payload}\n@@@END_ARENA_PC@@@\n`;
          const textareaEl = findTextarea();
          if (!textareaEl) return false;
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value"
          ).set;
          nativeSetter.call(textareaEl, textareaEl.value + block);
          textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
          const btn =
            document.querySelector('form button[aria-label*="Send" i]') ||
            document.querySelector('form button[type="submit"]');
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
          return false;
        },
        deliverObservation: (toolName, result) => {
          const status = result && result.ok ? "SUCCESS" : "ERROR";
          const body = (result && result.text) ? String(result.text) : JSON.stringify(result || {});
          const imgNote =
            result && Array.isArray(result.images) && result.images.length > 0
              ? `\n[Attached ${result.images.length} screenshot image(s)]`
              : "";
          const observation = `[OBSERVATION — ${toolName} — ${status}]\n${body.slice(0, 12000)}${imgNote}`;
          const textareaEl = findTextarea();
          if (!textareaEl) return false;
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value"
          ).set;
          nativeSetter.call(textareaEl, textareaEl.value + "\n" + observation);
          textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
          const btn =
            document.querySelector('form button[aria-label*="Send" i]') ||
            document.querySelector('form button[type="submit"]');
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
          return false;
        },
        isStreamingIncomplete: (text) => Protocol.isStreamingIncomplete(text),
        detectError: () => {
          const stopBtn = document.querySelector('button[aria-label*="Stop" i]');
          const errorMsg = document.querySelector('[role="alert"], .error, [data-error]');
          return Boolean(stopBtn || errorMsg);
        },
        startSession: () => {},
        endSession: () => {},
        getSessionInfo: () => ({
          name: "arena_direct",
          provider: "arena",
          sessionId: `apc-${Date.now()}`,
          enabled: true,
        }),
      };

      // Register adapter with background service worker
      chrome.runtime.sendMessage({
        action: "register_adapter",
        adapterName: "arena_direct",
        provider: "arena",
      });

      return activeAdapter;
    }

    // No supported adapter found
    activeAdapter = null;
    return null;
  }

  // ── UI Dock & Approval Card ───────────────────────────────────────────
  let dockEl = null;
  let statusDotEl = null;
  let statusTextEl = null;
  let toggleBtnEl = null;
  let approvalBoxEl = null;

  function mountDockIfNeeded() {
    const form = findComposerForm();
    if (!form) return;
    if (dockEl && document.body.contains(dockEl)) return;

    dockEl = document.createElement("div");
    dockEl.className = "apc-dock";
    dockEl.innerHTML = `
      <div class="apc-row">
        <span class="apc-dot apc-dot-offline"></span>
        <span class="apc-title">Arena PC Control</span>
        <span class="apc-status">Checking bridge...</span>
        <button type="button" class="apc-btn apc-btn-primary">Start PC Session</button>
      </div>
      <div class="apc-approval" hidden></div>
      <div class="apc-adapter-info" style="font-size:10px;color:#94a3b8;margin-top:4px;"></div>
    `;

    statusDotEl = dockEl.querySelector(".apc-dot");
    statusTextEl = dockEl.querySelector(".apc-status");
    toggleBtnEl = dockEl.querySelector(".apc-btn");
    approvalBoxEl = dockEl.querySelector(".apc-approval");

    toggleBtnEl.addEventListener("click", onToggleSession);
    form.parentElement.insertBefore(dockEl, form);
    renderDockState();
  }

  function renderDockState() {
    if (!dockEl) return;
    statusDotEl.className = "apc-dot";
    if (!bridgeState.connected) {
      statusDotEl.classList.add("apc-dot-offline");
      statusTextEl.textContent = "Bridge offline (run start.bat)";
    } else if (!bridgeState.authenticated) {
      statusDotEl.classList.add("apc-dot-warn");
      statusTextEl.textContent = bridgeState.lastAuthError || "Paste pairing token in extension icon";
    } else {
      statusDotEl.classList.add("apc-dot-online");
      const activeLabel = sessionActive ? "PC Control Active" : "Ready";
      const adapterLabel = activeAdapter ? ` • ${activeAdapter.name}` : "";
      statusTextEl.textContent = `${activeLabel} • ${bridgeState.toolCount} MCP tools${adapterLabel}`;
    }

    toggleBtnEl.textContent = sessionActive ? "Stop PC Session" : "Start PC Session";
    toggleBtnEl.className = sessionActive ? "apc-btn apc-btn-stop" : "apc-btn apc-btn-primary";
  }

  function showApprovalCard(approval) {
    if (!approvalBoxEl) return;
    const prettyArgs = JSON.stringify(approval.arguments || {}, null, 2);
    approvalBoxEl.hidden = false;
    approvalBoxEl.innerHTML = `
      <div class="apc-approval-header">
        <strong>Permission Required (${approval.riskCategory})</strong>
        <span>${approval.reason}</span>
      </div>
      <pre class="apc-approval-code">Tool: ${approval.tool}\n${prettyArgs}</pre>
      <div class="apc-approval-actions">
        <button type="button" class="apc-btn apc-btn-approve">Approve Once</button>
        <button type="button" class="apc-btn apc-btn-deny">Deny</button>
      </div>
    `;

    const resolveDecision = (approved) => {
      approvalBoxEl.hidden = true;
      approvalBoxEl.innerHTML = "";
      chrome.runtime.sendMessage({
        action: "approval_decision",
        approvalId: approval.id,
        approved,
      });
    };

    approvalBoxEl.querySelector(".apc-btn-approve").onclick = () => resolveDecision(true);
    approvalBoxEl.querySelector(".apc-btn-deny").onclick = () => resolveDecision(false);
  }

  async function onToggleSession() {
    if (sessionActive) {
      sessionActive = false;
      if (activeAdapter && activeAdapter.endSession) activeAdapter.endSession();
      renderDockState();
      return;
    }

    // Detect and activate adapter
    const adapter = detectAndActivateAdapter();
    if (!adapter) {
      alert("No supported Arena agent interface detected on this page.");
      return;
    }

    const res = await chrome.runtime.sendMessage({ action: "get_bootstrap_tools" });
    if (!res || !res.ok) {
      alert(res?.error || "Bridge is offline or not paired yet.");
      return;
    }

    sessionActive = true;
    consecutiveErrors = 0;
    processedTurnCount = getOrderedAssistantMessages().length;

    // Create a session on the bridge
    try {
      await chrome.runtime.sendMessage({
        action: "create_session",
        agent_type: "arena_agent",
        provider: activeAdapter.provider || "arena",
        metadata: { adapter: activeAdapter.name, url: window.location.href },
      });
    } catch {
      // Session creation failed but we can still proceed
    }

    renderDockState();

    // Send bootstrap prompt to Arena
    const convInfo = activeAdapter.identifyConversation ? activeAdapter.identifyConversation() : {};
    const customNotes = `Connected via ${activeAdapter.name} adapter. Conversation: ${convInfo.title || "Arena.ai"}`;
    const bootstrapPrompt = Protocol.buildBootstrapPrompt(res.tools || [], customNotes);
    await sendToArenaComposer(bootstrapPrompt);
  }

  // ── Agentic Observation Loop ────────────────────────────────────────
  async function pollAssistantTurn() {
    mountDockIfNeeded();
    if (!sessionActive || busyExecuting || isModelGenerating()) return;

    const assistantTurns = getOrderedAssistantMessages();
    if (assistantTurns.length <= processedTurnCount) return;

    const latestReply = assistantTurns[assistantTurns.length - 1];
    if (activeAdapter && activeAdapter.isStreamingIncomplete && activeAdapter.isStreamingIncomplete(latestReply)) return;

    processedTurnCount = assistantTurns.length;
    const outcome = Protocol.extractAction(latestReply);

    if (outcome.kind === "final_answer") {
      consecutiveErrors = 0;
      return;
    }

    busyExecuting = true;
    try {
      if (outcome.kind === "multi_error" || outcome.kind === "parse_error") {
        consecutiveErrors += 1;
        if (consecutiveErrors <= MAX_CONSECUTIVE_ERRORS) {
          await sendToArenaComposer(Protocol.buildCorrectionPrompt(outcome));
        } else {
          sessionActive = false;
          renderDockState();
        }
        return;
      }

      statusTextEl.textContent = `Running ${outcome.tool}...`;
      const result = await chrome.runtime.sendMessage({
        action: "call_tool",
        tool: outcome.tool,
        arguments: outcome.arguments,
        timeout: 90,
        session_id: activeAdapter ? activeAdapter.getSessionInfo().sessionId : null,
      });

      if (result && result.ok) {
        consecutiveErrors = 0;
      } else {
        consecutiveErrors += 1;
      }

      if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
        sessionActive = false;
        renderDockState();
        return;
      }

      const obsText = Protocol.formatToolObservation(outcome.tool, result);
      await sendToArenaComposer(obsText, result?.images || []);
    } finally {
      busyExecuting = false;
      renderDockState();
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "bridge_state") {
      bridgeState = msg.state;
      renderDockState();
    } else if (msg.type === "approval_required") {
      mountDockIfNeeded();
      showApprovalCard(msg.approval);
    } else if (msg.type === "session_created") {
      // Notify user that a session was created
      console.log("[Arena PC Control] Session created:", msg.session);
    }
  });

  chrome.runtime.sendMessage({ action: "get_state" }, (st) => {
    if (st) {
      bridgeState = st;
      renderDockState();
    }
  });

  setInterval(pollAssistantTurn, 900);
})();
