/**
 * Arena PC Control — Arena.ai Content Script Adapter & Approval UI.
 *
 * Non-destructive integration:
 *  - Leaves Arena completely untouched until the user clicks "Start PC Session".
 *  - Renders a compact dock above the Arena chat input showing live connection status.
 *  - Displays an explicit Approve / Deny confirmation card whenever PolicyEngine
 *    flags a CONFIRM-tier action (deletions, installs, shell writes, outside paths).
 */
(() => {
  "use strict";

  const Protocol = window.ArenaPCProtocol;
  if (!Protocol) return;

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
  };

  // ── Arena DOM Helpers ─────────────────────────────────────────────────
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
    // Arena Direct mode uses a reversed <ol class="... flex-col-reverse ...">
    const ol =
      document.querySelector("ol.flex-col-reverse") ||
      [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose"));
    if (!ol) return [];
    const items = [...ol.children].reverse();
    const assistantProse = [];
    for (const item of items) {
      if (item.classList.contains("justify-end")) continue; // User turn
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
      statusTextEl.textContent = "Bridge offline (run start_windows.bat)";
    } else if (!bridgeState.authenticated) {
      statusDotEl.classList.add("apc-dot-warn");
      statusTextEl.textContent = bridgeState.lastAuthError || "Paste pairing token in extension icon";
    } else {
      statusDotEl.classList.add("apc-dot-online");
      const activeLabel = sessionActive ? "Active Agent Loop" : "Ready";
      statusTextEl.textContent = `${activeLabel} • ${bridgeState.toolCount} MCP tools`;
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
      renderDockState();
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
    renderDockState();

    const bootstrapPrompt = Protocol.buildBootstrapPrompt(res.tools || []);
    await sendToArenaComposer(bootstrapPrompt);
  }

  // ── Agentic Observation Loop ──────────────────────────────────────────
  async function pollAssistantTurn() {
    mountDockIfNeeded();
    if (!sessionActive || busyExecuting || isModelGenerating()) return;

    const assistantTurns = getOrderedAssistantMessages();
    if (assistantTurns.length <= processedTurnCount) return;

    const latestReply = assistantTurns[assistantTurns.length - 1];
    if (Protocol.isStreamingIncomplete(latestReply)) return;

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
