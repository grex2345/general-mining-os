/**
 * Arena PC Control — Manifest V3 Background Service Worker (Universal Connector).
 *
 * Maintains the authenticated loopback WebSocket to ws://127.0.0.1:<port>
 * and relays tool calls + Human-in-the-Loop approval prompts to Arena tabs.
 *
 * Universal Provider Adapter Architecture:
 *   • Registers multiple provider adapters (Arena Direct, etc.)
 *   • Auto-detects which adapter matches the current Arena.ai tab
 *   • Routes tool calls and observations through the active adapter
 *   • Each adapter manages its own session per conversation
 *
 * Security:
 *   • Authenticated loopback WebSocket only
 *   • Origin allowlist for browser extensions
 *   • 256-bit pairing token
 *   • Multi-session isolation via correlation IDs
 */
"use strict";

const DEFAULT_PORT = 18765;

// Import provider adapters (MV3 service workers support ES modules via importScripts or inline)
// We define adapters inline to avoid module resolution issues in service workers.
let ArenaDirectAdapter = null;
let BaseProviderAdapter = null;

// ── Provider Adapter Registry ──────────────────────────────────────────
const providerAdapters = []; // Array of { name, adapter, detectFn }

// Register a provider adapter
function registerProviderAdapter(name, adapterClass, detectFn) {
  providerAdapters.push({ name, adapter: adapterClass, detect: detectFn });
}

// Find the matching adapter for the current tab (called from content script context)
function getAdapterForTab(tabId, url) {
  // In MV3, detection happens in the content script (arena_adapter.js) which
  // has DOM access. The background stores the active adapter per tab.
  return tabActiveAdapters.get(tabId) || null;
}

// Map tabId -> active adapter instance
const tabActiveAdapters = new Map();

// ── WebSocket & Bridge State ───────────────────────────────────────────
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

function broadcastToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function currentStateSnapshot() {
  return {
    connected,
    authenticated,
    lastAuthError,
    toolCount: toolsCatalog.length,
    servers: serverStatuses,
    activeAdapters: [...tabActiveAdapters.entries()].map(([tid, ad]) => ({
      tabId: tid,
      adapter: ad.getSessionInfo(),
    })),
  };
}

function broadcastState() {
  broadcastToArenaTabs({ type: "bridge_state", state: currentStateSnapshot() });
}

function sendFrame(payload, timeoutMs = 135000) {
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, error: "Local bridge is offline. Start start.bat." });
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
    } else if (msg.type === "session_created") {
      // Notify the specific tab that a session was created
      if (msg.session_id) {
        // Find which tab this relates to and notify
        broadcastToArenaTabs({
          type: "session_created",
          session: { session_id: msg.session_id, agent_type: msg.agent_type, provider: msg.provider },
        });
      }
    } else if (msg.type === "sessions_result") {
      broadcastToArenaTabs({
        type: "sessions_result",
        sessions: msg.sessions,
      });
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
    const tabId = _sender.tab ? _sender.tab.id : null;

    if (req.action === "get_state") {
      await ensureConnected();
      sendResponse(currentStateSnapshot());
      return true;
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
      await new Promise((r) => setTimeout(r, 450));
      sendResponse(currentStateSnapshot());
      return true;
    }

    if (req.action === "get_bootstrap_tools") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
        return true;
      }
      const res = await sendFrame({ type: "list_tools", refresh: true }, 20000);
      sendResponse({ ok: true, tools: res.tools || toolsCatalog });
      return true;
    }

    if (req.action === "call_tool") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({
          ok: false,
          text: lastAuthError || "Bridge offline or unauthenticated.",
          images: [],
        });
        return true;
      }
      const res = await sendFrame(
        {
          type: "call_tool",
          tool: req.tool,
          arguments: req.arguments || {},
          timeout: req.timeout || 90,
          correlation_id: req.correlation_id,
          session_id: req.session_id,
          resource_id: req.resource_id,
        },
        140000
      );
      sendResponse(res);
      return true;
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
      return true;
    }

    if (req.action === "register_adapter") {
      // Content script registers which adapter is active for this tab
      if (tabId && req.adapterName) {
        tabActiveAdapters.set(tabId, {
          name: req.adapterName,
          provider: req.provider || "unknown",
          registeredAt: Date.now(),
        });
        broadcastState();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (req.action === "get_active_adapter") {
      if (tabId) {
        const info = tabActiveAdapters.get(tabId);
        sendResponse({ ok: true, adapter: info || null });
      } else {
        sendResponse({ ok: false, error: "No tab context" });
      }
      return true;
    }

    if (req.action === "create_session") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
        return true;
      }
      const res = await sendFrame(
        {
          type: "create_session",
          agent_type: req.agent_type || "arena_agent",
          provider: req.provider || null,
          metadata: req.metadata || {},
        },
        10000
      );
      sendResponse(res);
      return true;
    }

    if (req.action === "list_sessions") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
        return true;
      }
      const res = await sendFrame({ type: "list_sessions" }, 10000);
      sendResponse(res);
      return true;
    }

    if (req.action === "close_session") {
      await ensureConnected();
      if (!authenticated) {
        sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
        return true;
      }
      const res = await sendFrame(
        { type: "close_session", session_id: req.session_id },
        10000
      );
      sendResponse(res);
      return true;
    }

    sendResponse({ ok: false, error: "Unknown extension action." });
  })();
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActiveAdapters.delete(tabId);
});

ensureConnected();
