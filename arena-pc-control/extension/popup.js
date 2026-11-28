"use strict";

/**
 * Arena PC Control — Extension popup.
 *
 * Pairs the extension with the local Bridge and shows live status. Talks to the
 * background service worker only through chrome.runtime.sendMessage.
 */

const statusBox = document.getElementById("statusBox");
const portInput = document.getElementById("portInput");
const tokenInput = document.getElementById("tokenInput");
const saveBtn = document.getElementById("saveBtn");
const refreshBtn = document.getElementById("refreshBtn");
const hint = document.getElementById("hint");

function render(st) {
  if (!st || !st.connected) {
    statusBox.textContent = "Offline — start the bridge (scripts/start.bat) on your PC.";
    statusBox.style.borderLeft = "3px solid #ef4444";
    return;
  }
  if (!st.authenticated) {
    statusBox.textContent = st.lastAuthError || "Connected — waiting for a valid pairing token.";
    statusBox.style.borderLeft = "3px solid #f59e0b";
    return;
  }
  const servers = (st.servers || [])
    .map((s) => `${s.id}: ${s.running ? "online" : "down"} (${s.toolCount || 0})`)
    .join(", ");
  statusBox.textContent = `Paired & Ready — ${st.toolCount} MCP tools${servers ? ` • ${servers}` : ""}.`;
  statusBox.style.borderLeft = "3px solid #22c55e";
}

function requestState() {
  chrome.runtime.sendMessage({ action: "get_state" }, (st) => {
    if (chrome.runtime.lastError) {
      statusBox.textContent = `Extension worker error: ${chrome.runtime.lastError.message}`;
      statusBox.style.borderLeft = "3px solid #ef4444";
      return;
    }
    render(st);
  });
}

chrome.storage.local.get(["bridgePort", "authToken"], (cfg) => {
  if (cfg && cfg.bridgePort) portInput.value = cfg.bridgePort;
  if (cfg && cfg.authToken) tokenInput.value = cfg.authToken;
});

requestState();
setInterval(requestState, 2000);

saveBtn.addEventListener("click", () => {
  saveBtn.disabled = true;
  saveBtn.textContent = "Pairing…";
  chrome.runtime.sendMessage(
    {
      action: "save_settings",
      port: Number(portInput.value) || 18765,
      token: tokenInput.value.trim(),
    },
    (st) => {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Pair Bridge";
      if (chrome.runtime.lastError) {
        statusBox.textContent = `Extension worker error: ${chrome.runtime.lastError.message}`;
        statusBox.style.borderLeft = "3px solid #ef4444";
        return;
      }
      render(st);
    }
  );
});

refreshBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "get_bootstrap_tools" }, (res) => {
    if (res && res.ok) {
      hint.textContent = `Tool catalog refreshed: ${res.tools.length} tools.`;
    } else {
      hint.textContent = (res && res.error) || "Could not refresh the tool catalog.";
    }
  });
});

tokenInput.addEventListener("paste", () => {
  hint.textContent = "Token pasted — click “Save & Pair Bridge”.";
});
