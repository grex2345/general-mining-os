#!/usr/bin/env python3
"""Authenticated Local WebSocket Bridge for Arena PC Control.

Security architecture:
  1. Binds strictly to 127.0.0.1 (never exposed to LAN/WAN).
  2. Refuses elevated Administrator startup on Windows by default.
  3. Enforces WebSocket Origin allowlist: browser extensions (chrome-extension://,
     moz-extension://) or local CLI clients (Origin: None). Any website origin
     (e.g. https://evil.example) is rejected during handshake!
  4. Requires 256-bit cryptographic token authentication (`type: "auth"`) before
     exposing tools or executing commands.
  5. Enforces PolicyEngine (`ALLOW` / `CONFIRM` / `DENY`) with real-time
     Human-in-the-Loop approval modals and JSONL audit logging.
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

_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from bridge.mcp_client import MCPRouter  # noqa: E402
from bridge.policy import ActionTier, PolicyEngine  # noqa: E402


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
    """Coordinates WebSocket sessions, PolicyEngine approvals, Audit logs, and MCPRouter."""

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

        self.policy = PolicyEngine(config.get("policy"))
        self.router = MCPRouter(base_dir=self.base_dir)
        self.router.load_servers(config.get("mcpServers") or {})

        self._authed_clients: set[ServerConnection] = set()
        self._pending_approvals: dict[str, asyncio.Future[bool]] = {}
        self._ws_server: Any = None

    def write_audit(self, event: str, details: dict[str, Any]) -> None:
        record = {
            "ts": round(time.time(), 3),
            "event": event,
            **details,
        }
        with open(self.audit_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    async def start(self) -> dict[str, str]:
        statuses = await asyncio.to_thread(self.router.start_all)
        self._ws_server = await serve(
            self._handle_client,
            self.host,
            self.port,
            origins=ALLOWED_ORIGIN_PATTERNS,
            max_size=12 * 1024 * 1024,  # Allow base64 screenshots up to ~12MB
        )
        # Update self.port if started with port=0 (ephemeral test port)
        if self._ws_server.sockets:
            self.port = self._ws_server.sockets[0].getsockname()[1]
        self.write_audit("bridge_started", {"host": self.host, "port": self.port, "servers": statuses})
        return statuses

    async def stop(self) -> None:
        for fut in list(self._pending_approvals.values()):
            if not fut.done():
                fut.set_result(False)
        self._pending_approvals.clear()
        if self._ws_server is not None:
            self._ws_server.close()
            await self._ws_server.wait_closed()
            self._ws_server = None
        await asyncio.to_thread(self.router.stop_all)

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False)
        stale: list[ServerConnection] = []
        for ws in list(self._authed_clients):
            try:
                await ws.send(raw)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._authed_clients.discard(ws)

    async def _request_human_approval(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        reason: str,
        risk_category: str,
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
            },
        }
        self.write_audit("approval_requested", prompt_payload["approval"])
        await self._broadcast(prompt_payload)

        try:
            approved = await asyncio.wait_for(fut, timeout=self.approval_timeout)
        except asyncio.TimeoutError:
            approved = False
        finally:
            self._pending_approvals.pop(approval_id, None)

        self.write_audit(
            "approval_resolved",
            {"id": approval_id, "tool": tool_name, "approved": approved},
        )
        return approved

    async def _handle_client(self, ws: ServerConnection) -> None:
        authenticated = False
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
                    if candidate and hmac.compare_digest(candidate, self.auth_token):
                        authenticated = True
                        self._authed_clients.add(ws)
                        await ws.send(
                            json.dumps({
                                "type": "auth_ok",
                                "id": req_id,
                                "servers": self.router.server_statuses(),
                                "tools": self.router.list_tools(),
                            })
                        )
                    else:
                        self.write_audit("auth_failed", {})
                        await ws.send(
                            json.dumps({
                                "type": "auth_error",
                                "id": req_id,
                                "error": "Invalid pairing token. Copy token from bridge terminal.",
                            })
                        )
                    continue

                if not authenticated:
                    await ws.send(
                        json.dumps({
                            "type": "error",
                            "id": req_id,
                            "error": "Unauthenticated session. Send {type: 'auth', token} first.",
                        })
                    )
                    continue

                if mtype == "status":
                    await ws.send(
                        json.dumps({
                            "type": "status_result",
                            "id": req_id,
                            "servers": self.router.server_statuses(),
                            "toolCount": len(self.router.list_tools()),
                        })
                    )
                elif mtype == "list_tools":
                    refresh = bool(msg.get("refresh", False))
                    tools = await asyncio.to_thread(self.router.list_tools, refresh)
                    await ws.send(
                        json.dumps({
                            "type": "tools_result",
                            "id": req_id,
                            "tools": tools,
                            "servers": self.router.server_statuses(),
                        })
                    )
                elif mtype == "approval_decision":
                    aid = str(msg.get("approval_id") or "")
                    approved = bool(msg.get("approved", False))
                    fut = self._pending_approvals.get(aid)
                    if fut and not fut.done():
                        fut.set_result(approved)
                    await ws.send(
                        json.dumps({"type": "approval_ack", "id": req_id, "approval_id": aid})
                    )
                elif mtype == "call_tool":
                    # Spawn as background task so this socket can still send `approval_decision`!
                    asyncio.create_task(self._execute_tool_request(ws, req_id, msg))
                else:
                    await ws.send(
                        json.dumps({
                            "type": "error",
                            "id": req_id,
                            "error": f"Unknown message type: {mtype}",
                        })
                    )
        finally:
            self._authed_clients.discard(ws)

    async def _execute_tool_request(
        self,
        ws: ServerConnection,
        req_id: Any,
        msg: dict[str, Any],
    ) -> None:
        tool_name = str(msg.get("tool") or "").strip()
        arguments = dict(msg.get("arguments") or {})
        timeout = float(msg.get("timeout") or 60.0)

        verdict = self.policy.evaluate_tool(tool_name, arguments)
        if verdict.tier == ActionTier.DENY:
            self.write_audit(
                "tool_denied_policy",
                {"tool": tool_name, "reason": verdict.reason, "category": verdict.risk_category},
            )
            await ws.send(
                json.dumps({
                    "type": "tool_result",
                    "id": req_id,
                    "ok": False,
                    "policyBlocked": True,
                    "text": f"POLICY BLOCKED ({verdict.risk_category}): {verdict.reason}",
                    "images": [],
                })
            )
            return

        if verdict.tier == ActionTier.CONFIRM:
            approved = await self._request_human_approval(
                tool_name,
                arguments,
                verdict.reason,
                verdict.risk_category,
            )
            if not approved:
                await ws.send(
                    json.dumps({
                        "type": "tool_result",
                        "id": req_id,
                        "ok": False,
                        "userDenied": True,
                        "text": (
                            f"USER DENIED OR TIMED OUT: Action '{tool_name}' was not approved "
                            f"({verdict.reason}). Do not repeat without asking the user."
                        ),
                        "images": [],
                    })
                )
                return

        try:
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
                },
            )
            await ws.send(
                json.dumps({
                    "type": "tool_result",
                    "id": req_id,
                    **result,
                })
            )
        except Exception as exc:
            self.write_audit(
                "tool_exception",
                {"tool": tool_name, "error": f"{type(exc).__name__}: {exc}"},
            )
            await ws.send(
                json.dumps({
                    "type": "tool_result",
                    "id": req_id,
                    "ok": False,
                    "is_error": True,
                    "text": f"Execution error: {exc}",
                    "images": [],
                })
            )


def load_config(config_path: Path | None = None) -> dict[str, Any]:
    local_cfg = _ROOT_DIR / "config.local.json"
    default_cfg = _ROOT_DIR / "config.default.json"
    chosen = config_path or (local_cfg if local_cfg.exists() else default_cfg)
    with open(chosen, "r", encoding="utf-8") as fh:
        return json.load(fh)


async def _main_async(config_path: Path | None) -> None:
    cfg = load_config(config_path)
    bridge = BridgeServer(cfg)
    statuses = await bridge.start()

    print("=" * 68)
    print("  ARENA PC CONTROL — LOCAL SECURE MCP BRIDGE")
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
    args = parser.parse_args()
    try:
        asyncio.run(_main_async(args.config))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
