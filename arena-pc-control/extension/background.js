/**
 * Arena PC Control — Manifest V3 Background Service Worker.
 * Maintains the authenticated loopback WebSocket to ws://127.0.0.1:<port>
 * and relays tool calls + Human-in-the-Loop approval prompts to Arena tabs.
 */
"use strict";

const DEFAULT_PORT = 18765;

let socket = null;
let connected = false;
let authenticated = false;
let lastAuthError = "";
let toolsCatalog = [];
let serverStatuses = [];
let seqId = 1;
const pendingRequests = new Map();
let reconnectTimer = null;
let heartbeatTimer = null;

async function getSettings() {
  const stored = await chrome.storage.local.get(["bridgePort", "authToken"]);
  return {
    port: Number(stored.bridgePort) || DEFAULT_PORT,
    token: String(stored.authToken || "").trim(),
  };
}

function broadcastToArenaTabs(message) {
  chrome.tabs.query({ url: "https://arena.ai/*" }, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

function currentStateSnapshot() {
  return {
    connected,
    authenticated,
    lastAuthError,
    toolCount: toolsCatalog.length,
    servers: serverStatuses,
  };
}

function broadcastState() {
  broadcastToArenaTabs({ type: "bridge_state", state: currentStateSnapshot() });
}

function sendFrame(payload, timeoutMs = 135000) {
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, error: "Local bridge is offline. Start start_windows.bat." });
      return;
    }
    const id = seqId++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      resolve({ ok: false, error: `Bridge request timed out after ${Math.round(timeoutMs / 1000)}s.` });
    }, timeoutMs);
    pendingRequests.set(id, { resolve, timer });
    socket.send(JSON.stringify({ ...payload, id }));
  });
}

async function ensureConnected() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearTimeout(reconnectTimer);
  const { port, token } = await getSettings();
  const wsUrl = `ws://127.0.0.1:${port}`;

  try {
    socket = new WebSocket(wsUrl);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = async () => {
    connected = true;
    authenticated = false;
    lastAuthError = "";
    startHeartbeat();
    if (token) {
      await sendFrame({ type: "auth", token }, 10000);
    } else {
      lastAuthError = "Pairing token not set. Open extension popup and paste token.";
      broadcastState();
    }
  };

  socket.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "approval_required") {
      broadcastToArenaTabs({ type: "approval_required", approval: msg.approval });
      return;
    }

    if (msg.type === "auth_ok") {
      authenticated = true;
      lastAuthError = "";
      toolsCatalog = msg.tools || [];
      serverStatuses = msg.servers || [];
      broadcastState();
    } else if (msg.type === "auth_error") {
      authenticated = false;
      lastAuthError = msg.error || "Invalid pairing token.";
      broadcastState();
    } else if (msg.type === "tools_result") {
      toolsCatalog = msg.tools || [];
      serverStatuses = msg.servers || [];
      broadcastState();
    }

    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
      const waiter = pendingRequests.get(msg.id);
      clearTimeout(waiter.timer);
      pendingRequests.delete(msg.id);
      waiter.resolve(msg);
    }
  };

  socket.onclose = () => {
    connected = false;
    authenticated = false;
    stopHeartbeat();
    for (const [, waiter] of pendingRequests) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: "Bridge connection closed." });
    }
    pendingRequests.clear();
    broadcastState();
    scheduleReconnect();
  };

  socket.onerror = () => {};
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    ensureConnected();
  }, 3000);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
    }
  }, 12000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  (async () => {
    if (req.action === "get_state") {
      await ensureConnected();
      sendResponse(currentStateSnapshot());
      return;
    }

    if (req.action === "save_settings") {
      await chrome.storage.local.set({
        bridgePort: Number(req.port) || DEFAULT_PORT,
        authToken: String(req.token || "").trim(),
      });
      if (socket) {
        socket.close();
        socket = null;
      }
      await ensureConnected();
      // Give auth handshake up to 500ms to settle before responding to popup
      await new Promise((r) => setTimeout(r, 450));
      sendResponse(currentStateSnapshot());
      return;
    }

    if (req.action === "get_bootstrap_tools") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
        return;
      }
      const res = await sendFrame({ type: "list_tools", refresh: true }, 20000);
      sendResponse({ ok: true, tools: res.tools || toolsCatalog });
      return;
    }

    if (req.action === "call_tool") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({
          ok: false,
          text: lastAuthError || "Bridge offline or unauthenticated.",
          images: [],
        });
        return;
      }
      const res = await sendFrame(
        {
          type: "call_tool",
          tool: req.tool,
          arguments: req.arguments || {},
          timeout: req.timeout || 90,
        },
        140000
      );
      sendResponse(res);
      return;
    }

    if (req.action === "approval_decision") {
      const res = await sendFrame(
        {
          type: "approval_decision",
          approval_id: req.approvalId,
          approved: Boolean(req.approved),
        },
        10000
      );
      sendResponse(res);
      return;
    }

    sendResponse({ ok: false, error: "Unknown extension action." });
  })();
  return true;
});

ensureConnected();
