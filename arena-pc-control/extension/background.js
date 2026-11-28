/**
 * Arena PC Control — Manifest V3 Background Service Worker (Universal Connector).
 *
 * Holds the single authenticated loopback WebSocket to ws://127.0.0.1:<port>
 * and relays tool calls + Human-in-the-Loop approval prompts between Arena tabs
 * and the local Bridge.
 *
 * Provider-adapter architecture:
 *   • content scripts (arena_adapter.js) detect the Arena agent interface and
 *     register per-tab adapter info with this worker
 *   • each tab owns at most one bridge session, which is stored here so
 *     approvals and screenshots can be routed back to the exact tab that
 *     requested them
 *
 * Protocol invariants (must match bridge/server.py):
 *   • requests carry a numeric `id`; replies echo that `id`
 *   • approvals are addressed by `approval_id` and are only honored from the
 *     WebSocket that requested them (the Bridge enforces this too)
 *   • the socket must not be written to concurrently while another request is
 *     awaiting its reply, otherwise replies can interleave and id matching
 *     breaks — sends are therefore serialized below
 */
"use strict";

const DEFAULT_PORT = 18765;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const HEARTBEAT_MS = 12000;
const AUTH_TIMEOUT_MS = 12000;

// ── Bridge connection state ────────────────────────────────────────────
let socket = null;
let connected = false;
let authenticated = false;
let lastAuthError = "";
let toolsCatalog = [];
let serverStatuses = [];
let sessionId = null; // bridge session for this socket
let lastPongAt = 0;
let reconnectAttempts = 0;

let seqId = 1;
const pendingRequests = new Map(); // id -> { resolve, timer }
const pendingTabIds = new Map(); // id -> tabId that originated the request
let reconnectTimer = null;
let heartbeatTimer = null;
let connecting = false;

// tabId <-> bridge session mapping (for approval + image routing)
const tabSessionMap = new Map(); // tabId -> session_id
const sessionTabMap = new Map(); // session_id -> tabId
const tabAdapters = new Map(); // tabId -> { name, provider, registeredAt }

// Serialize socket writes: a request is written only after the previous
// request/response pair completed, so replies can never interleave.
let sendQueue = Promise.resolve();

// ── Settings ───────────────────────────────────────────────────────────
async function getSettings() {
  const stored = await chrome.storage.local.get(["bridgePort", "authToken"]);
  return {
    port: Number(stored.bridgePort) || DEFAULT_PORT,
    token: String(stored.authToken || "").trim(),
  };
}

function currentStateSnapshot() {
  return {
    connected,
    authenticated,
    lastAuthError,
    sessionId,
    toolCount: toolsCatalog.length,
    servers: serverStatuses,
    tools: toolsCatalog.map((t) => t.name),
    activeAdapters: [...tabAdapters.entries()].map(([tabId, info]) => ({ tabId, adapter: info })),
  };
}

function broadcastToArenaTabs(message) {
  chrome.tabs.query({ url: ["https://arena.ai/*", "https://www.arena.ai/*"] }, (tabs) => {
    for (const tab of tabs || []) {
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

function sendToTab(tabId, message) {
  if (!tabId) return false;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
  return true;
}

function sendToTabForSession(targetSessionId, message) {
  const tabId = targetSessionId ? sessionTabMap.get(targetSessionId) : null;
  if (tabId) {
    return sendToTab(tabId, message);
  }
  broadcastToArenaTabs(message);
  return false;
}

function broadcastState() {
  broadcastToArenaTabs({ type: "bridge_state", state: currentStateSnapshot() });
}

// ── Frame I/O ──────────────────────────────────────────────────────────
function sendFrame(payload, timeoutMs = 135000, tabId = null) {
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== 1 /* OPEN */) {
      resolve({ ok: false, error: "Local bridge is offline. Start it with start_windows.bat." });
      return;
    }
    const id = seqId++;
    if (tabId) pendingTabIds.set(id, tabId);

    const timer = setTimeout(() => {
      pendingTabIds.delete(id);
      pendingRequests.delete(id);
      resolve({ ok: false, error: `Bridge request timed out after ${Math.round(timeoutMs / 1000)}s.` });
    }, timeoutMs);

    pendingRequests.set(id, { resolve, timer });

    // Serialize writes so concurrent requests cannot interleave frames.
    sendQueue = sendQueue.then(async () => {
      try {
        if (!socket || socket.readyState !== 1) throw new Error("socket closed");
        if (!pendingRequests.has(id)) return; // already timed out
        socket.send(JSON.stringify({ ...payload, id }));
      } catch (err) {
        if (pendingRequests.has(id)) {
          const waiter = pendingRequests.get(id);
          clearTimeout(waiter.timer);
          pendingRequests.delete(id);
          pendingTabIds.delete(id);
          waiter.resolve({ ok: false, error: `Bridge send failed: ${err.message || err}` });
        }
      }
    });
  });
}

function resolvePending(id, msg) {
  const waiter = pendingRequests.get(id);
  if (!waiter) return;
  clearTimeout(waiter.timer);
  pendingRequests.delete(id);
  pendingTabIds.delete(id);
  waiter.resolve(msg);
}

function rejectAllPending(reason) {
  for (const [, waiter] of pendingRequests) {
    clearTimeout(waiter.timer);
    waiter.resolve({ ok: false, error: reason });
  }
  pendingRequests.clear();
  pendingTabIds.clear();
}

// ── Connection management ──────────────────────────────────────────────
async function ensureConnected() {
  if (socket && (socket.readyState === 0 /* CONNECTING */ || socket.readyState === 1 /* OPEN */)) {
    return;
  }
  if (connecting) return;
  connecting = true;
  clearTimeout(reconnectTimer);

  const { port } = await getSettings();
  const wsUrl = `ws://127.0.0.1:${port}`;

  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    connecting = false;
    lastAuthError = `Cannot open bridge socket: ${err.message || err}`;
    scheduleReconnect();
    return;
  }

  socket.onopen = async () => {
    connecting = false;
    connected = true;
    authenticated = false;
    sessionId = null;
    lastAuthError = "";
    lastPongAt = Date.now();
    reconnectAttempts = 0;
    startHeartbeat();

    const { token } = await getSettings();
    if (!token) {
      lastAuthError = "Pairing token not set. Open the extension popup and paste the token.";
      broadcastState();
      return;
    }
    const authRes = await sendFrame(
      { type: "auth", token, agent_type: "arena_agent", provider: "arena" },
      AUTH_TIMEOUT_MS
    );
    if (authRes && authRes.type === "auth_ok") {
      authenticated = true;
      sessionId = authRes.session_id || null;
      toolsCatalog = authRes.tools || [];
      serverStatuses = authRes.servers || [];
      lastAuthError = "";
    } else {
      authenticated = false;
      lastAuthError = (authRes && (authRes.error || authRes.text)) || "Bridge did not acknowledge auth.";
    }
    broadcastState();
  };

  socket.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "pong") {
      lastPongAt = Date.now();
      return;
    }

    if (msg.type === "approval_required") {
      const approval = msg.approval || {};
      const ownerSession = approval.session_id;
      sendToTabForSession(ownerSession, { type: "approval_required", approval });
      return;
    }

    if (msg.type === "auth_ok") {
      authenticated = true;
      sessionId = msg.session_id || sessionId;
      toolsCatalog = msg.tools || toolsCatalog;
      serverStatuses = msg.servers || serverStatuses;
      lastAuthError = "";
      broadcastState();
    } else if (msg.type === "auth_error") {
      authenticated = false;
      lastAuthError = msg.error || "Invalid pairing token.";
      broadcastState();
    } else if (msg.type === "tools_result") {
      toolsCatalog = msg.tools || toolsCatalog;
      serverStatuses = msg.servers || serverStatuses;
      broadcastState();
    } else if (msg.type === "mcp_status") {
      toolsCatalog = msg.tools || toolsCatalog;
      serverStatuses = msg.servers || serverStatuses;
      broadcastState();
    } else if (msg.type === "session_created") {
      // Record the mapping BEFORE resolving the caller so a fast CONFIRM-tier
      // tool call cannot race ahead of the tab<->session mapping.
      const tabId = pendingTabIds.get(msg.id);
      if (msg.session_id && tabId) {
        tabSessionMap.set(tabId, msg.session_id);
        sessionTabMap.set(msg.session_id, tabId);
      }
      sendToTabForSession(msg.session_id, {
        type: "session_created",
        session: {
          session_id: msg.session_id,
          agent_type: msg.agent_type,
          provider: msg.provider,
        },
      });
    } else if (msg.type === "sessions_result") {
      broadcastToArenaTabs({ type: "sessions_result", sessions: msg.sessions });
    }

    if (msg.id !== undefined && msg.id !== null) {
      resolvePending(msg.id, msg);
    }
  };

  socket.onclose = () => {
    connecting = false;
    connected = false;
    authenticated = false;
    sessionId = null;
    stopHeartbeat();
    rejectAllPending("Bridge connection closed.");
    broadcastState();
    scheduleReconnect();
  };

  socket.onerror = () => {
    // A close event always follows; nothing to do here except keep the worker alive.
    lastAuthError = "Cannot reach the local bridge (ws://127.0.0.1).";
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  const delay = Math.min(RECONNECT_MIN_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    ensureConnected().catch(() => {});
  }, delay);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!socket || socket.readyState !== 1) return;
    // If the bridge stopped answering pings, force a reconnect.
    if (Date.now() - lastPongAt > HEARTBEAT_MS * 3) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      socket.send(JSON.stringify({ type: "ping" }));
    } catch {
      /* ignore */
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ── Message router (content scripts + popup) ───────────────────────────
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (!req || typeof req !== "object") return false;

  const tabId = sender && sender.tab ? sender.tab.id : null;

  (async () => {
    switch (req.action) {
      case "get_state": {
        await ensureConnected().catch(() => {});
        sendResponse(currentStateSnapshot());
        return;
      }

      case "save_settings": {
        await chrome.storage.local.set({
          bridgePort: Number(req.port) || DEFAULT_PORT,
          authToken: String(req.token || "").trim(),
        });
        // Reconnect with the new credentials.
        try {
          if (socket) socket.close();
        } catch {
          /* ignore */
        }
        socket = null;
        connected = false;
        authenticated = false;
        reconnectAttempts = 0;
        await ensureConnected().catch(() => {});
        // Give the handshake a moment so the popup can render the result.
        for (let i = 0; i < 20 && !authenticated; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        sendResponse(currentStateSnapshot());
        return;
      }

      case "get_bootstrap_tools": {
        await ensureConnected().catch(() => {});
        if (!authenticated) {
          sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
          return;
        }
        const res = await sendFrame({ type: "list_tools", refresh: true }, 25000);
        if (res && Array.isArray(res.tools)) {
          toolsCatalog = res.tools;
          serverStatuses = res.servers || serverStatuses;
          sendResponse({ ok: true, tools: res.tools, servers: serverStatuses });
        } else {
          sendResponse({ ok: true, tools: toolsCatalog, servers: serverStatuses });
        }
        return;
      }

      case "call_tool": {
        await ensureConnected().catch(() => {});
        if (!authenticated) {
          sendResponse({
            ok: false,
            text: lastAuthError || "Bridge offline or unauthenticated.",
            images: [],
          });
          return;
        }
        const toolTimeout = Number(req.timeout) || 120;
        const res = await sendFrame(
          {
            type: "call_tool",
            tool: req.tool,
            arguments: req.arguments || {},
            timeout: toolTimeout,
            correlation_id: req.correlation_id,
            session_id: req.session_id,
            resource_id: req.resource_id,
          },
          // Extra headroom for a CONFIRM-tier approval prompt (default 120s).
          (toolTimeout + 150) * 1000,
          tabId
        );
        sendResponse(res);
        return;
      }

      case "approval_decision": {
        await ensureConnected().catch(() => {});
        const res = await sendFrame(
          {
            type: "approval_decision",
            approval_id: req.approvalId,
            approved: Boolean(req.approved),
          },
          15000,
          tabId
        );
        sendResponse(res || { ok: false, error: "no bridge response" });
        return;
      }

      case "create_session": {
        await ensureConnected().catch(() => {});
        if (!authenticated) {
          sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
          return;
        }
        const res = await sendFrame(
          {
            type: "create_session",
            agent_type: req.agent_type || "arena_agent",
            provider: req.provider || null,
            metadata: req.metadata || {},
          },
          15000,
          tabId
        );
        sendResponse(res);
        return;
      }

      case "list_sessions": {
        await ensureConnected().catch(() => {});
        if (!authenticated) {
          sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
          return;
        }
        sendResponse(await sendFrame({ type: "list_sessions" }, 15000, tabId));
        return;
      }

      case "close_session": {
        await ensureConnected().catch(() => {});
        if (!authenticated) {
          sendResponse({ ok: false, error: lastAuthError || "Bridge not authenticated." });
          return;
        }
        const closing = req.session_id || (tabId ? tabSessionMap.get(tabId) : null);
        const res = await sendFrame({ type: "close_session", session_id: closing }, 15000, tabId);
        if (closing && sessionTabMap.get(closing) === tabId) {
          sessionTabMap.delete(closing);
          tabSessionMap.delete(tabId);
        }
        sendResponse(res);
        return;
      }

      case "register_adapter": {
        if (tabId) {
          tabAdapters.set(tabId, {
            name: req.adapterName,
            provider: req.provider || "unknown",
            registeredAt: Date.now(),
          });
          broadcastState();
        }
        sendResponse({ ok: true });
        return;
      }

      case "get_active_adapter": {
        sendResponse({ ok: true, adapter: tabId ? tabAdapters.get(tabId) || null : null });
        return;
      }

      default:
        sendResponse({ ok: false, error: `Unknown extension action: ${req.action}` });
    }
  })().catch((err) => {
    try {
      sendResponse({ ok: false, error: `Extension error: ${err.message || err}` });
    } catch {
      /* channel already closed */
    }
  });

  // Keep the message channel open for the async response.
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabAdapters.delete(tabId);
  const sid = tabSessionMap.get(tabId);
  if (sid) {
    sessionTabMap.delete(sid);
    tabSessionMap.delete(tabId);
    // Best-effort session cleanup on the bridge.
    sendFrame({ type: "close_session", session_id: sid }, 5000).catch(() => {});
  }
});

chrome.runtime.onInstalled?.addListener(() => {
  broadcastState();
});

chrome.runtime.onStartup?.addListener(() => {
  ensureConnected().catch(() => {});
});

ensureConnected().catch(() => {});
