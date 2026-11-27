"use strict";

const statusBox = document.getElementById("statusBox");
const portInput = document.getElementById("portInput");
const tokenInput = document.getElementById("tokenInput");
const saveBtn = document.getElementById("saveBtn");

function render(st) {
  if (!st || !st.connected) {
    statusBox.textContent = "Offline — Run start_windows.bat on your PC.";
    statusBox.style.borderLeft = "3px solid #ef4444";
    return;
  }
  if (!st.authenticated) {
    statusBox.textContent = st.lastAuthError || "Connected, waiting for valid pairing token.";
    statusBox.style.borderLeft = "3px solid #f59e0b";
    return;
  }
  statusBox.textContent = `Paired & Ready — ${st.toolCount} MCP tools available.`;
  statusBox.style.borderLeft = "3px solid #22c55e";
}

chrome.storage.local.get(["bridgePort", "authToken"], (cfg) => {
  if (cfg.bridgePort) portInput.value = cfg.bridgePort;
  if (cfg.authToken) tokenInput.value = cfg.authToken;
});

chrome.runtime.sendMessage({ action: "get_state" }, render);

saveBtn.addEventListener("click", () => {
  saveBtn.disabled = true;
  chrome.runtime.sendMessage(
    {
      action: "save_settings",
      port: Number(portInput.value) || 18765,
      token: tokenInput.value.trim(),
    },
    (st) => {
      saveBtn.disabled = false;
      render(st);
    }
  );
});
