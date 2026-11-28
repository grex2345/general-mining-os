#!/usr/bin/env python3
"""Verify that the Arena PC Control Bridge is operational.

Performs a multi-stage verification:
  1. TCP port listening check.
  2. WebSocket handshake to the Bridge.
  3. Authentication with the pairing token.
  4. Bridge operational check (list_tools call).

Exit code 0 only if ALL stages succeed. Never reports readiness on TCP alone.
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import time
from pathlib import Path

try:
    from websockets.asyncio.client import connect  # type: ignore
except ImportError:  # pragma: no cover - websockets is a required dependency
    connect = None  # type: ignore

import asyncio


def check_tcp(host: str, port: int, timeout: float = 3.0) -> tuple[bool, str]:
    """Stage 1: Verify TCP port is open."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"TCP port {host}:{port} is open."
    except OSError as exc:
        return False, f"TCP port {host}:{port} is not reachable: {exc}"


async def check_websocket_and_auth(
    host: str, port: int, token: str, timeout: float = 8.0
) -> tuple[bool, str]:
    """Stages 2-4: WebSocket handshake, authentication, operational check."""
    if connect is None:
        return False, "websockets library is not installed."

    ws_url = f"ws://{host}:{port}"
    try:
        async with connect(ws_url, origin="chrome-extension://verify", open_timeout=timeout) as ws:
            # Stage 2: WebSocket handshake succeeded (connection opened)

            # Stage 3: Authenticate with pairing token
            await ws.send(
                json.dumps(
                    {
                        "id": 1,
                        "type": "auth",
                        "token": token,
                    }
                )
            )
            try:
                auth_reply = await asyncio.wait_for(ws.recv(), timeout=timeout)
            except asyncio.TimeoutError:
                return False, "Authentication timed out waiting for response."

            auth_msg = json.loads(auth_reply)
            if auth_msg.get("type") != "auth_ok":
                return False, f"Authentication failed: {auth_msg.get('error', 'unknown error')}"

            # Stage 4: Bridge operational — call list_tools
            await ws.send(
                json.dumps(
                    {
                        "id": 2,
                        "type": "list_tools",
                    }
                )
            )
            try:
                tools_reply = await asyncio.wait_for(ws.recv(), timeout=timeout)
            except asyncio.TimeoutError:
                return False, "list_tools timed out waiting for response."

            tools_msg = json.loads(tools_reply)
            if tools_msg.get("type") != "tools_result":
                return False, f"Bridge not operational: unexpected response {tools_msg.get('type')}"

            tools = tools_msg.get("tools", [])
            if not isinstance(tools, list) or len(tools) == 0:
                return False, "Bridge is operational but reports zero tools."

            return True, (
                f"WebSocket handshake OK, authentication OK, "
                f"{len(tools)} MCP tools available."
            )

    except Exception as exc:  # noqa: BLE001 - report any connection failure
        return False, f"WebSocket verification failed: {exc}"


def load_token(state_dir: Path | None = None) -> str | None:
    """Load the pairing token from the state directory."""
    if state_dir is None:
        state_dir = Path.home() / ".arena-pc-control"
    token_file = state_dir / "auth_token.txt"
    if not token_file.exists():
        return None
    try:
        token = token_file.read_text(encoding="utf-8").strip()
        return token if len(token) >= 24 else None
    except OSError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the Arena PC Control Bridge is operational."
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bridge host (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help="TCP port the Bridge should be listening on.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="Maximum seconds to wait for each verification stage.",
    )
    args = parser.parse_args()

    failures: list[str] = []

    # ── Stage 1: TCP port listening ──
    tcp_ok, tcp_msg = check_tcp(args.host, args.port, timeout=args.timeout)
    print(f"[1/4] TCP check: {'PASS' if tcp_ok else 'FAIL'} — {tcp_msg}")
    if not tcp_ok:
        failures.append(tcp_msg)
        print("\nVERIFICATION FAILED: Bridge is not listening on the configured port.")
        print(f"  Host: {args.host}")
        print(f"  Port: {args.port}")
        print("\n  Start the Bridge with: scripts/start.bat")
        print(f"  Check logs: {args.host}:{args.port} stderr/stdout logs")
        return 1

    # ── Stages 2-4: WebSocket, auth, operational ──
    token = load_token()
    if token is None:
        print(
            f"[2/4] WebSocket+Auth+Ops: FAIL — "
            f"pairing token not found at ~/.arena-pc-control/auth_token.txt"
        )
        print("\nVERIFICATION FAILED: Bridge authentication token is missing.")
        print("  Run the Bridge once to generate ~/.arena-pc-control/auth_token.txt")
        print("  Then pair the token in the Arena PC Control Extension.")
        print("  Without authentication, SYSTEM READY must NOT be reported.")
        return 1

    ws_ok, ws_msg = asyncio.run(
        check_websocket_and_auth(args.host, args.port, token, timeout=args.timeout)
    )
    print(f"[2/4] WebSocket+Auth+Ops: {'PASS' if ws_ok else 'FAIL'} — {ws_msg}")
    if not ws_ok:
        failures.append(ws_msg)
        print("\nVERIFICATION FAILED: Bridge is not fully operational.")
        print("  Check logs: scripts/start.bat produces bridge.stdout.log and bridge.stderr.log")
        return 1

    print("\nVERIFICATION PASSED: Bridge is fully operational.")
    print(f"  WebSocket: ws://{args.host}:{args.port}")
    print(f"  Authentication: valid pairing token")
    print(f"  MCP tools: available")
    return 0


if __name__ == "__main__":
    sys.exit(main())
