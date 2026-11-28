#!/usr/bin/env python3
"""Authenticated Local WebSocket Bridge for Arena PC Control.

Multi-session shared Bridge architecture:

  1. Binds strictly to 127.0.0.1 (never exposed to LAN/WAN).
  2. Refuses elevated Administrator startup on Windows by default.
  3. Enforces WebSocket Origin allowlist: browser extensions (chrome-extension://,
     moz-extension://) or local CLI clients (Origin: None). Any website origin
     (e.g. https://evil.example) is rejected during handshake!
  4. Requires 256-bit cryptographic token authentication (`type: "auth"`) before
     exposing tools or executing commands.
  5. Enforces PolicyEngine (`ALLOW` / `CONFIRM` / `DENY`) with real-time
     Human-in-the-Loop approval modals and JSONL audit logging.
  6. Multi-session support: each connected agent (independent JARVIS or external
     Arena agent) gets an isolated session with correlation IDs and resource
     locking to prevent conflicting PC operations.
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
from typing import Any
import uuid

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from bridge.mcp_client import MCPRouter  # noqa: E402
from bridge.policy import ActionTier, PolicyEngine  # noqa: E402
from bridge.session_manager import session_manager  # noqa: E402
from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402


ALLOWED_ORIGIN_PATTERNS = [
    re.compile(r"^chrome-extension://[a-z0-9_-]+$", re.I),
    re.compile(r"^moz-extension://[a-z0-9_-]+$", re.I),
    None,  # Local Python CLI / selftest without browser Origin header
]


def _is_windows_admin() -> bool:
    if sys.platform != "win32":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def load_or_create_token(state_dir: Path) -> str:
    state_dir.mkdir(parents=True, exist_ok=True)
    token_file = state_dir / "auth_token.txt"
    if token_file.exists():
        existing = token_file.read_text(encoding="utf-8").strip()
        if len(existing) >= 24:
            return existing
    token = secrets.token_urlsafe(32)
    token_file.write_text(token + "\n", encoding="utf-8")
    try:
        os.chmod(token_file, 0o600)
    except OSError:
        pass
    return token


class BridgeServer:
    """Coordinates WebSocket sessions, PolicyEngine approvals, Audit logs, MCPRouter,
    and multi-agent session isolation."""

    def __init__(
        self,
        config: dict[str, Any],
        *,
        base_dir: Path | None = None,
        state_dir: Path | None = None,
        auth_token: str | None = None,
    ) -> None:
        self.base_dir = (base_dir or _ROOT_DIR).resolve()
        self.state_dir = (state_dir or (Path.home() / ".arena-pc-control")).resolve()
        self.state_dir.mkdir(parents=True, exist_ok=True)

        bridge_cfg = dict(config.get("bridge") or {})
        self.host = str(bridge_cfg.get("host", "127.0.0.1")).strip()
        if self.host not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError(
                f"Refusing insecure non-loopback host '{self.host}'. Must be 127.0.0.1."
            )
        self.port = int(bridge_cfg.get("port", 18765))
        self.approval_timeout = float(bridge_cfg.get("approvalTimeoutSeconds", 120.0))
        self.refuse_admin = bool(bridge_cfg.get("refuseAdminStartup", True))

        if self.refuse_admin and _is_windows_admin():
            raise PermissionError(
                "Refusing to run with Windows Administrator privileges. "
                "Start the bridge as a standard non-admin user."
            )

        self.auth_token = auth_token or load_or_create_token(self.state_dir)
        self.audit_path = self.state_dir / "audit.jsonl"
        self.lock_path = self.state_dir / "bridge.pid"
        self._lock_fd: int | None = None

        self.policy = PolicyEngine(config.get("policy"))
        self.router = MCPRouter(base_dir=self.base_dir)
        self.router.load_servers(config.get("mcpServers") or {})
        self.emergency = EmergencyStop()

        self._authed_clients: dict[ServerConnection, str] = {}  # ws -> active session_id
        self._session_ws: dict[str, ServerConnection] = {}  # session_id -> primary ws
        # Every session a socket owns (the browser extension shares ONE socket
        # between all Arena tabs, so a socket can legitimately own many
        # sessions — each tool call must stay bound to the session it names).
        self._ws_sessions: dict[ServerConnection, set[str]] = {}
        self._session_owners: dict[str, set[ServerConnection]] = {}
        self._pending_approvals: dict[str, asyncio.Future[bool]] = {}
        self._approval_owner: dict[str, ServerConnection] = {}  # approval_id -> owning WS
        self._ws_server: Any = None
        # ── MCP server health monitoring (inspired by ZeroScript server_watch) ──
        # Poll every configured MCP server; auto-restart any that died
        # unexpectedly so a dead server is not discovered only on the next
        # real tool call. Never raises — best effort only.
        self._monitor_stop = asyncio.Event()
        self._monitor_task: asyncio.Task[None] | None = None
        self._monitor_interval = float(bridge_cfg.get("serverMonitorIntervalSeconds", 5.0))
        # Crash-loop detection: LOOP_N deaths within LOOP_WINDOW seconds means
        # something is killing (or instantly crashing) the server every time we
        # bring it back. We keep restarting but name the problem loudly.
        self._monitor_loop_n = int(bridge_cfg.get("serverMonitorLoopN", 3))
        self._monitor_loop_window = float(bridge_cfg.get("serverMonitorLoopWindowSeconds", 60.0))
        self._monitor_restart_times: dict[str, list[float]] = {}
        self._monitor_loop_warned_at: dict[str, float] = {}
        # Ping/pong keepalive: a browser tab that crashes or is suspended gets
        # its session released instead of lingering as a ghost approval owner.
        self.ping_interval = float(bridge_cfg.get("pingIntervalSeconds", 20.0))
        self.ping_timeout = float(bridge_cfg.get("pingTimeoutSeconds", 20.0))
        # 0 disables reaping (sessions then live until the socket closes).
        self.session_idle_timeout = float(
            bridge_cfg.get("sessionIdleTimeoutSeconds", 3600.0)
        )

    # ── Session management ─────────────────────────────────────────────
    def _create_session(
        self,
        agent_type: str = "arena_agent",
        provider: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        session = session_manager.create_session(
            agent_type=agent_type, provider=provider, metadata=metadata
        )
        self.write_audit(
            "session_created",
            {
                "session_id": session.session_id,
                "agent_type": agent_type,
                "provider": provider,
            },
        )
        return session.session_id

    def _get_session_for_ws(self, ws: ServerConnection) -> str | None:
        return self._authed_clients.get(ws)

    def _associate_ws_with_session(self, ws: ServerConnection, session_id: str) -> None:
        self._authed_clients[ws] = session_id
        self._session_ws[session_id] = ws
        self._ws_sessions.setdefault(ws, set()).add(session_id)
        self._session_owners.setdefault(session_id, set()).add(ws)

    def _owns_session(self, ws: ServerConnection, session_id: str) -> bool:
        return ws in self._session_owners.get(session_id, set())

    def _cancel_approvals_for(self, ws: ServerConnection) -> int:
        """Fail every approval still waiting on this socket.

        Without this, a tab that closes (or crashes) while an approval card is
        on screen leaves the tool call blocked until `approvalTimeoutSeconds`
        expires — the agent looks frozen for two minutes. The approval is
        resolved as *denied* immediately and the decision is audited.
        """
        cancelled = 0
        for approval_id, owner in list(self._approval_owner.items()):
            if owner is not ws:
                continue
            fut = self._pending_approvals.pop(approval_id, None)
            self._approval_owner.pop(approval_id, None)
            if fut is not None and not fut.done():
                fut.set_result(False)
                cancelled += 1
            self.write_audit(
                "approval_cancelled",
                {"id": approval_id, "reason": "owning socket disconnected"},
            )
        return cancelled

    def _disassociate_ws(self, ws: ServerConnection) -> str | None:
        """Detach a socket and close every session it owned."""
        self._cancel_approvals_for(ws)
        active = self._authed_clients.pop(ws, None)
        owned = self._ws_sessions.pop(ws, set())
        if active:
            owned.add(active)
        for session_id in owned:
            owners = self._session_owners.get(session_id)
            if owners is not None:
                owners.discard(ws)
                if owners:
                    # Still owned by another socket: keep it alive.
                    continue
                self._session_owners.pop(session_id, None)
            if self._session_ws.get(session_id) is ws:
                self._session_ws.pop(session_id, None)
            session_manager.close_session(session_id)
            self.write_audit("session_closed", {"session_id": session_id})
        return active

    # ── Audit logging ──────────────────────────────────────────────────
    def write_audit(self, event: str, details: dict[str, Any]) -> None:
        record = {
            "ts": round(time.time(), 3),
            "event": event,
            **details,
        }
        with open(self.audit_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    # ── Lifecycle ──────────────────────────────────────────────────────
    # ── Single-instance protection ─────────────────────────────────
    def _acquire_instance_lock(self) -> None:
        """Refuse to run two bridges on the same state directory.

        Two bridges would fight over the port and silently steal each other's
        pairing token, which looks exactly like "the extension keeps dropping".
        """
        try:
            import fcntl  # POSIX
        except ImportError:  # pragma: no cover - Windows
            fcntl = None  # type: ignore[assignment]

        fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        if fcntl is not None:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                os.close(fd)
                raise RuntimeError(
                    f"Another Arena PC Control bridge is already running "
                    f"(lock: {self.lock_path}). Stop it before starting a new one."
                ) from exc
        else:
            # Windows: use an exclusive lock on the file handle.
            try:
                import msvcrt

                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                os.close(fd)
                raise RuntimeError(
                    f"Another Arena PC Control bridge is already running "
                    f"(lock: {self.lock_path}). Stop it before starting a new one."
                ) from exc
        os.write(fd, str(os.getpid()).encode("ascii"))
        os.fsync(fd)
        self._lock_fd = fd

    def _release_instance_lock(self) -> None:
        fd, self._lock_fd = self._lock_fd, None
        if fd is None:
            return
        try:
            os.close(fd)
        except OSError:
            pass

    async def start(self) -> dict[str, str]:
        self._acquire_instance_lock()
        statuses = await asyncio.to_thread(self.router.start_all)
        self._ws_server = await serve(
            self._handle_client,
            self.host,
            self.port,
            origins=ALLOWED_ORIGIN_PATTERNS,
            max_size=12 * 1024 * 1024,  # Allow base64 screenshots up to ~12MB
            ping_interval=self.ping_interval,
            ping_timeout=self.ping_timeout,
        )
        if self._ws_server.sockets:
            self.port = self._ws_server.sockets[0].getsockname()[1]
        # Start MCP server health monitor (best-effort, never raises).
        self._monitor_stop.clear()
        self._monitor_task = asyncio.create_task(self._monitor_servers())

        self.write_audit(
            "bridge_started",
            {"host": self.host, "port": self.port, "servers": statuses},
        )
        return statuses

    async def stop(self) -> None:
        self._monitor_stop.set()
        for fut in list(self._pending_approvals.values()):
            if not fut.done():
                fut.set_result(False)
        self._pending_approvals.clear()
        # Close all sessions
        for sid in [s["session_id"] for s in session_manager.list_sessions()]:
            session_manager.close_session(sid)
        if self._ws_server is not None:
            self._ws_server.close()
            await self._ws_server.wait_closed()
            self._ws_server = None
        await asyncio.to_thread(self.router.stop_all)
        self._release_instance_lock()

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False)
        stale: list[ServerConnection] = []
        for ws in list(self._authed_clients.keys()):
            try:
                await ws.send(raw)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._disassociate_ws(ws)

    # ── Human-in-the-Loop approval ─────────────────────────────────────
    async def _request_human_approval(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        reason: str,
        risk_category: str,
        session_id: str | None = None,
        owner_ws: "ServerConnection | None" = None,
    ) -> bool:
        approval_id = uuid.uuid4().hex[:12]
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[bool] = loop.create_future()
        self._pending_approvals[approval_id] = fut

        prompt_payload = {
            "type": "approval_required",
            "approval": {
                "id": approval_id,
                "tool": tool_name,
                "arguments": arguments,
                "reason": reason,
                "riskCategory": risk_category,
                "timeoutSeconds": self.approval_timeout,
                "session_id": session_id,
            },
        }
        self.write_audit("approval_requested", prompt_payload["approval"])
        # Send approval request ONLY to the WS that owns the session making the call.
        # Never broadcast to all authenticated clients — that would allow a
        # different connected agent to approve/deny another agent's action.
        # Prefer the socket that actually issued the call; fall back to the
        # session's registered socket. NEVER a global "any ws".
        if owner_ws is None:
            owner_ws = self._session_ws.get(session_id) if session_id else None
        self._approval_owner[approval_id] = owner_ws
        if owner_ws is not None:
            try:
                await owner_ws.send(json.dumps(prompt_payload, ensure_ascii=False))
            except Exception:
                # Owner WS is dead — fail the approval
                self._approval_owner.pop(approval_id, None)
                self._pending_approvals.pop(approval_id, None)
                return False

        try:
            approved = await asyncio.wait_for(fut, timeout=self.approval_timeout)
        except asyncio.TimeoutError:
            approved = False
        finally:
            self._pending_approvals.pop(approval_id, None)
            self._approval_owner.pop(approval_id, None)

        self.write_audit(
            "approval_resolved",
            {"id": approval_id, "tool": tool_name, "approved": approved, "session_id": session_id},
        )
        return approved

    # ── WebSocket client handler ───────────────────────────────────────
    async def _handle_client(self, ws: ServerConnection) -> None:
        authenticated = False
        session_id: str | None = None
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await ws.send(json.dumps({"type": "error", "error": "Invalid JSON frame."}))
                    continue

                mtype = msg.get("type")
                req_id = msg.get("id")

                if mtype == "ping":
                    await ws.send(json.dumps({"type": "pong", "id": req_id, "authed": authenticated}))
                    continue

                if mtype == "auth":
                    candidate = str(msg.get("token") or "").strip()
                    agent_type = str(msg.get("agent_type") or "arena_agent")
                    provider = str(msg.get("provider") or "") or None
                    metadata = msg.get("metadata") or {}

                    if candidate and hmac.compare_digest(candidate, self.auth_token):
                        authenticated = True
                        # Create or reuse a session for this authenticated connection
                        session_id = self._create_session(
                            agent_type=agent_type, provider=provider, metadata=metadata
                        )
                        self._associate_ws_with_session(ws, session_id)
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "auth_ok",
                                    "id": req_id,
                                    "session_id": session_id,
                                    "servers": self.router.server_statuses(),
                                    "tools": self.router.list_tools(),
                                }
                            )
                        )
                    else:
                        self.write_audit("auth_failed", {})
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "auth_error",
                                    "id": req_id,
                                    "error": "Invalid pairing token. Copy token from bridge terminal.",
                                }
                            )
                        )
                    continue

                if not authenticated:
                    await ws.send(
                        json.dumps(
                            {
                                "type": "error",
                                "id": req_id,
                                "error": "Unauthenticated session. Send {type: 'auth', token} first.",
                            }
                        )
                    )
                    continue

                session_id = self._get_session_for_ws(ws)

                if mtype == "status":
                    await ws.send(
                        json.dumps(
                            {
                                "type": "status_result",
                                "id": req_id,
                                "session_id": session_id,
                                "servers": self.router.server_statuses(),
                                "toolCount": len(self.router.list_tools()),
                                "sessions": session_manager.list_sessions(),
                            }
                        )
                    )
                elif mtype == "list_tools":
                    refresh = bool(msg.get("refresh", False))
                    tools = await asyncio.to_thread(self.router.list_tools, refresh)
                    await ws.send(
                        json.dumps(
                            {
                                "type": "tools_result",
                                "id": req_id,
                                "session_id": session_id,
                                "tools": tools,
                                "servers": self.router.server_statuses(),
                            }
                        )
                    )
                elif mtype == "create_session":
                    agent_type = str(msg.get("agent_type") or "arena_agent")
                    provider = str(msg.get("provider") or "") or None
                    new_sid = self._create_session(
                        agent_type=agent_type, provider=provider, metadata=msg.get("metadata") or {}
                    )
                    # Re-associate this WS with the new session.
                    # The previous session (if any) stays alive in the session manager
                    # but is no longer associated with this WebSocket.
                    old_sid = self._authed_clients.get(ws)
                    if old_sid and self._session_ws.get(old_sid) is ws:
                        del self._session_ws[old_sid]
                    self._associate_ws_with_session(ws, new_sid)
                    session_id = new_sid
                    await ws.send(
                        json.dumps(
                            {
                                "type": "session_created",
                                "id": req_id,
                                "session_id": session_id,
                                "agent_type": agent_type,
                                "provider": provider,
                            }
                        )
                    )
                elif mtype == "list_sessions":
                    await ws.send(
                        json.dumps(
                            {
                                "type": "sessions_result",
                                "id": req_id,
                                "session_id": session_id,
                                "sessions": session_manager.list_sessions(),
                            }
                        )
                    )
                elif mtype == "close_session":
                    sid = str(msg.get("session_id") or session_id or "")
                    if sid and not self._owns_session(ws, sid):
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "error",
                                    "id": req_id,
                                    "error": "Not authorized to close this session.",
                                }
                            )
                        )
                        continue
                    if sid:
                        session_manager.close_session(sid)
                        self._session_ws.pop(sid, None)
                        self._ws_sessions.get(ws, set()).discard(sid)
                        owners = self._session_owners.get(sid)
                        if owners is not None:
                            owners.discard(ws)
                            if not owners:
                                self._session_owners.pop(sid, None)
                        # Closing ONE session must never detach the socket or the
                        # other sessions it owns (a single background worker can
                        # own several Arena tabs). Only drop the "active"
                        # pointer when this was the active session.
                        if self._authed_clients.get(ws) == sid:
                            self._authed_clients.pop(ws, None)
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "session_closed",
                                    "id": req_id,
                                    "session_id": sid,
                                }
                            )
                        )
                    else:
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "error",
                                    "id": req_id,
                                    "error": "No session_id provided.",
                                }
                            )
                        )
                elif mtype == "approval_decision":
                    aid = str(msg.get("approval_id") or "")
                    approved = bool(msg.get("approved", False))
                    fut = self._pending_approvals.get(aid)
                    owner_ws = self._approval_owner.get(aid)
                    if owner_ws is not None and owner_ws is not ws:
                        # The WS sending this decision is NOT the one that owns
                        # the approval request. Reject it to prevent a different
                        # session from approving/denying another session's action.
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "error",
                                    "id": req_id,
                                    "error": "Not authorized to decide this approval.",
                                }
                            )
                        )
                        continue
                    if fut and not fut.done():
                        fut.set_result(approved)
                    await ws.send(
                        json.dumps({"type": "approval_ack", "id": req_id, "approval_id": aid})
                    )
                elif mtype == "call_tool":
                    # Spawn as background task so this socket can still send `approval_decision`
                    asyncio.create_task(
                        self._execute_tool_request(ws, req_id, msg, session_id)
                    )
                else:
                    await ws.send(
                        json.dumps(
                            {
                                "type": "error",
                                "id": req_id,
                                "error": f"Unknown message type: {mtype}",
                            }
                        )
                    )
        except ConnectionClosed:
            # Browser tab closed / extension reloaded / network dropped.
            # Normal lifecycle event — never surface it as a server error.
            pass
        finally:
            session_id = self._authed_clients.get(ws) or session_id
            self._disassociate_ws(ws)
            self._authed_clients.pop(ws, None)
            self._session_ws.pop(session_id, None) if session_id else None

    async def _execute_tool_request(
        self,
        ws: ServerConnection,
        req_id: Any,
        msg: dict[str, Any],
        session_id: str | None,
    ) -> None:
        tool_name = str(msg.get("tool") or "").strip()
        arguments = dict(msg.get("arguments") or {})
        timeout = max(1.0, min(float(msg.get("timeout") or 60.0), 600.0))

        # Bind the call to the session it names. One background worker socket can
        # own several Arena tabs (sessions), so the *named* session wins — but
        # only if this socket really owns it. Otherwise fall back to the
        # socket's active session, and never to "whatever was created last".
        requested_session = str(msg.get("session_id") or "").strip() or None
        if requested_session and self._owns_session(ws, requested_session):
            session_id = requested_session
        elif session_id and not self._owns_session(ws, session_id):
            session_id = None
        if session_id is None and requested_session is None:
            session_id = self._authed_clients.get(ws)

        correlation_id = str(
            msg.get("correlation_id")
            or session_manager.new_correlation_id(session_id or "anonymous")
        )
        if session_id:
            session_manager.touch(session_id)

        # Emergency stop: block ALL tool execution paths — including the direct
        # WebSocket path — before any policy check or router dispatch.
        if self.emergency.is_stopped:
            self.write_audit(
                "tool_blocked_emergency",
                {
                    "tool": tool_name,
                    "reason": "Emergency stop is active",
                    "session_id": session_id,
                    "correlation_id": correlation_id,
                },
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "tool_result",
                        "id": req_id,
                        "session_id": session_id,
                        "correlation_id": correlation_id,
                        "ok": False,
                        "userDenied": True,
                        "text": (
                            "EMERGENCY STOP is ACTIVE. All tool execution is halted. "
                            "Reset with emergency-stop --reset before continuing."
                        ),
                        "images": [],
                    }
                )
            )
            return

        # Resource locking: check if this tool requires exclusive access to a resource
        resource_id = str(msg.get("resource_id") or "")
        if resource_id:
            if not session_manager.acquire_resource(resource_id, session_id or "", timeout=5.0):
                await ws.send(
                    json.dumps(
                        {
                            "type": "tool_result",
                            "id": req_id,
                            "session_id": session_id,
                            "correlation_id": correlation_id,
                            "ok": False,
                            "resourceLocked": True,
                            "text": f"Resource '{resource_id}' is locked by another agent session. Try again later.",
                            "images": [],
                        }
                    )
                )
                return

        try:
            verdict = self.policy.evaluate_tool(tool_name, arguments)
            if verdict.tier == ActionTier.DENY:
                self.write_audit(
                    "tool_denied_policy",
                    {
                        "tool": tool_name,
                        "reason": verdict.reason,
                        "category": verdict.risk_category,
                        "session_id": session_id,
                        "correlation_id": correlation_id,
                    },
                )
                await ws.send(
                    json.dumps(
                        {
                            "type": "tool_result",
                            "id": req_id,
                            "session_id": session_id,
                            "correlation_id": correlation_id,
                            "ok": False,
                            "policyBlocked": True,
                            "text": f"POLICY BLOCKED ({verdict.risk_category}): {verdict.reason}",
                            "images": [],
                        }
                    )
                )
                return

            if verdict.tier == ActionTier.CONFIRM:
                approved = await self._request_human_approval(
                    tool_name,
                    arguments,
                    verdict.reason,
                    verdict.risk_category,
                    session_id,
                    owner_ws=ws,
                )
                if not approved:
                    await ws.send(
                        json.dumps(
                            {
                                "type": "tool_result",
                                "id": req_id,
                                "session_id": session_id,
                                "correlation_id": correlation_id,
                                "ok": False,
                                "userDenied": True,
                                "text": (
                                    f"USER DENIED OR TIMED OUT: Action '{tool_name}' was not approved "
                                    f"({verdict.reason}). Do not repeat without asking the user."
                                ),
                                "images": [],
                            }
                        )
                    )
                    return

            result = await asyncio.to_thread(
                self.router.call_tool,
                tool_name,
                arguments,
                timeout,
            )
            self.write_audit(
                "tool_executed",
                {
                    "tool": tool_name,
                    "ok": result.get("ok"),
                    "server": result.get("server"),
                    "duration_ms": result.get("duration_ms"),
                    "session_id": session_id,
                    "correlation_id": correlation_id,
                },
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "tool_result",
                        "id": req_id,
                        "session_id": session_id,
                        "correlation_id": correlation_id,
                        **result,
                    }
                )
            )
        except Exception as exc:
            self.write_audit(
                "tool_exception",
                {
                    "tool": tool_name,
                    "error": f"{type(exc).__name__}: {exc}",
                    "session_id": session_id,
                    "correlation_id": correlation_id,
                },
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "tool_result",
                        "id": req_id,
                        "session_id": session_id,
                        "correlation_id": correlation_id,
                        "ok": False,
                        "is_error": True,
                        "text": f"Execution error: {exc}",
                        "images": [],
                    }
                )
            )
        finally:
            if resource_id and session_id:
                session_manager.release_resource(resource_id, session_id)


    # ── MCP server health monitoring ───────────────────────────────────
    # Inspired by ZeroScript's server_watch(): polls every MCP server and
    # auto-restarts any that died unexpectedly. Detects crash loops and
    # names the real cause (exit code, stderr tail, port squatter) instead
    # of silently restarting forever.
    async def _monitor_servers(self) -> None:
        while not self._monitor_stop.is_set():
            try:
                await asyncio.sleep(self._monitor_interval)
                # Reap agent sessions that vanished without a close frame
                # (crashed tab, reloaded extension, half-open socket).
                reaped = session_manager.reap_idle_sessions(self.session_idle_timeout)
                for sid in reaped:
                    self._session_owners.pop(sid, None)
                    self._session_ws.pop(sid, None)
                    self.write_audit("session_reaped", {"session_id": sid})
                    print(f"[bridge] reaped idle session {sid}", flush=True)
                for sid, client in list(self.router.clients.items()):
                    try:
                        if client.is_running():
                            continue
                        # Server is dead — decide whether this is a crash loop.
                        now = time.time()
                        window = self._monitor_restart_times.setdefault(sid, [])
                        window[:] = [t for t in window if now - t < self._monitor_loop_window]
                        looping = len(window) >= self._monitor_loop_n
                        if looping:
                            warned_at = self._monitor_loop_warned_at.get(sid, 0.0)
                            if now - warned_at > self._monitor_loop_window:
                                self._monitor_loop_warned_at[sid] = now
                                self.write_audit(
                                    "server_crash_loop",
                                    {
                                        "server": sid,
                                        "deaths": len(window),
                                        "window_seconds": self._monitor_loop_window,
                                        "last_exit": client.last_error,
                                    },
                                )
                                print(
                                    f"[bridge] SERVER CRASH LOOP: '{sid}' died "
                                    f"{len(window)} times in {self._monitor_loop_window}s "
                                    f"(last error: {client.last_error or 'unknown'})",
                                    flush=True,
                                )
                        if looping and window and now - window[-1] < 15.0:
                            # Clearly hopeless right now — slow cadence, but keep retrying
                            # (the cause may clear, e.g. the user finally opens the app).
                            continue
                        window.append(now)
                        self.write_audit(
                            "server_dead_restart",
                            {"server": sid, "reason": client.last_error or "process exited"},
                        )
                        print(
                            f"[bridge] MCP server '{sid}' found dead - auto-restarting...",
                            flush=True,
                        )
                        await asyncio.to_thread(client.start)
                        self.router.rebuild_routes()
                        await self._broadcast_to_authed(
                            {
                                "type": "mcp_status",
                                "alive": self.router.any_alive(),
                                "servers": self.router.server_statuses(),
                                "tools": self.router.list_tools(),
                            }
                        )
                    except Exception as exc:
                        self.write_audit(
                            "server_restart_failed",
                            {"server": sid, "error": f"{type(exc).__name__}: {exc}"},
                        )
            except asyncio.CancelledError:
                break
            except Exception:
                # Never let the monitor kill the bridge.
                pass

    async def _broadcast_to_authed(self, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False)
        stale: list[ServerConnection] = []
        for ws in list(self._authed_clients.keys()):
            try:
                await ws.send(raw)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._disassociate_ws(ws)

def load_config(config_path: Path | None = None) -> dict[str, Any]:
    local_cfg = _ROOT_DIR / "config.local.json"
    default_cfg = _ROOT_DIR / "config.default.json"
    chosen = config_path or (local_cfg if local_cfg.exists() else default_cfg)
    with open(chosen, "r", encoding="utf-8") as fh:
        return json.load(fh)


async def _main_async(config_path: Path | None, port_override: int = 0) -> None:
    cfg = load_config(config_path)
    if port_override:
        # Lets the launcher and tests pin a port without editing config files.
        cfg.setdefault("bridge", {})["port"] = int(port_override)
    bridge = BridgeServer(cfg)
    statuses = await bridge.start()

    print("=" * 68)
    print("  ARENA PC CONTROL — LOCAL SECURE MCP BRIDGE (Multi-Session)")
    print("=" * 68)
    print(f"  Listening on : ws://{bridge.host}:{bridge.port} (loopback only)")
    print(f"  Audit log    : {bridge.audit_path}")
    print("  MCP Servers  :")
    for sid, st in statuses.items():
        print(f"    - {sid}: {st}")
    print("-" * 68)
    print("  PAIRING TOKEN (paste once into the Arena PC Control Extension):")
    print(f"\n    {bridge.auth_token}\n")
    print("=" * 68)
    print("  Press Ctrl+C to stop.")

    stop_event = asyncio.Event()
    try:
        await stop_event.wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await bridge.stop()


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the Arena PC Control Local Bridge.")
    parser.add_argument("--config", type=Path, default=None, help="Path to config JSON file.")
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Override bridge.port from the config file.",
    )
    parser.add_argument(
        "--print-token",
        action="store_true",
        help="Print the pairing token and exit (used by launcher scripts).",
    )
    args = parser.parse_args()

    if args.print_token:
        cfg = load_config(args.config)
        bridge_cfg = dict(cfg.get("bridge") or {})
        state_dir = Path(
            os.path.expanduser(str(bridge_cfg.get("stateDir") or "~/.arena-pc-control"))
        )
        print(load_or_create_token(state_dir))
        return

    try:
        asyncio.run(_main_async(args.config, port_override=args.port))
    except KeyboardInterrupt:
        pass
    except PermissionError as exc:
        print(f"\n[BLOCKED] {exc}\n", file=sys.stderr)
        raise SystemExit(2) from None
    except OSError as exc:
        # The single most common failure is "port already in use".
        hint = ""
        if getattr(exc, "errno", None) in (48, 98, 10048):
            hint = (
                "Another program (usually an older bridge) is already listening "
                "on this port. Close it, or change bridge.port in config.local.json."
            )
        print(f"\n[ERROR] The bridge could not start: {exc}", file=sys.stderr)
        if hint:
            print(f"        {hint}", file=sys.stderr)
        print("", file=sys.stderr)
        raise SystemExit(1) from None
    except RuntimeError as exc:
        print(f"\n[ERROR] {exc}\n", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
