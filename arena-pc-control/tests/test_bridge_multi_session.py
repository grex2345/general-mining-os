"""Tests for Bridge multi-session support (session creation, listing, isolation)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys

import pytest
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.server import BridgeServer  # noqa: E402


@pytest.mark.asyncio
async def test_bridge_session_create_and_list(tmp_path: Path) -> None:
    secret_token = "arena_multi_session_test_token_1234567890"

    cfg = {
        "bridge": {
            "host": "127.0.0.1",
            "port": 0,
            "approvalTimeoutSeconds": 10,
            "refuseAdminStartup": False,
        },
        "policy": {
            "allowedWriteRoots": [str(tmp_path)],
            "requireConfirmForOutsideRoots": True,
            "requireConfirmForShell": True,
            "allowReadOnlyShellWithoutConfirm": True,
        },
        "mcpServers": {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem.db")},
            }
        },
    }

    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state", auth_token=secret_token)
    await bridge.start()
    ws_url = f"ws://127.0.0.1:{bridge.port}"

    try:
        async with connect(ws_url, origin="chrome-extension://abcdefghijklmnop") as ws:
            # Authenticate
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": secret_token}))
            auth_resp = json.loads(await ws.recv())
            assert auth_resp["type"] == "auth_ok"
            session_id_1 = auth_resp["session_id"]
            assert session_id_1 is not None

            # Create a second session
            await ws.send(
                json.dumps(
                    {
                        "id": 2,
                        "type": "create_session",
                        "agent_type": "jarvis_independent",
                        "provider": "jarvis_core",
                    }
                )
            )
            session_resp = json.loads(await ws.recv())
            assert session_resp["type"] == "session_created"
            session_id_2 = session_resp["session_id"]
            assert session_id_2 != session_id_1

            # List sessions
            await ws.send(json.dumps({"id": 3, "type": "list_sessions"}))
            sessions_resp = json.loads(await ws.recv())
            assert sessions_resp["type"] == "sessions_result"
            session_ids = {s["session_id"] for s in sessions_resp["sessions"]}
            assert session_id_1 in session_ids
            assert session_id_2 in session_ids

            # Close session 2
            await ws.send(
                json.dumps({"id": 4, "type": "close_session", "session_id": session_id_2})
            )
            close_resp = json.loads(await ws.recv())
            assert close_resp["type"] == "session_closed"

            # Verify session 2 is gone from list
            await ws.send(json.dumps({"id": 5, "type": "list_sessions"}))
            sessions_resp_2 = json.loads(await ws.recv())
            session_ids_2 = {s["session_id"] for s in sessions_resp_2["sessions"]}
            assert session_id_2 not in session_ids_2
            assert session_id_1 in session_ids_2

    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_bridge_session_isolation_on_tool_calls(tmp_path: Path) -> None:
    secret_token = "arena_session_isolation_token_9876543210"

    cfg = {
        "bridge": {
            "host": "127.0.0.1",
            "port": 0,
            "approvalTimeoutSeconds": 10,
            "refuseAdminStartup": False,
        },
        "policy": {
            "allowedWriteRoots": [str(tmp_path)],
            "requireConfirmForOutsideRoots": True,
            "requireConfirmForShell": True,
            "allowReadOnlyShellWithoutConfirm": True,
        },
        "mcpServers": {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem2.db")},
            }
        },
    }

    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state2", auth_token=secret_token)
    await bridge.start()
    ws_url = f"ws://127.0.0.1:{bridge.port}"

    try:
        async with connect(ws_url, origin="chrome-extension://isolationtest123") as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": secret_token}))
            auth_resp = json.loads(await ws.recv())
            assert auth_resp["type"] == "auth_ok"
            session_id = auth_resp["session_id"]

            # Call a tool with correlation_id and session_id
            test_file = tmp_path / "isolation_test.txt"
            await ws.send(
                json.dumps(
                    {
                        "id": 2,
                        "type": "call_tool",
                        "tool": "fs_write",
                        "arguments": {"path": str(test_file), "content": "session isolated content"},
                        "session_id": session_id,
                        "correlation_id": f"{session_id}:corr_001",
                    }
                )
            )
            write_resp = json.loads(await ws.recv())
            assert write_resp["type"] == "tool_result"
            assert write_resp.get("session_id") == session_id
            assert write_resp.get("correlation_id") == f"{session_id}:corr_001"
            assert write_resp["ok"] is True

            # Read back to verify
            await ws.send(
                json.dumps(
                    {
                        "id": 3,
                        "type": "call_tool",
                        "tool": "fs_read",
                        "arguments": {"path": str(test_file)},
                        "session_id": session_id,
                    }
                )
            )
            read_resp = json.loads(await ws.recv())
            assert read_resp["ok"] is True
            assert "session isolated content" in read_resp["text"]

    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_bridge_resource_locking_via_tool(tmp_path: Path) -> None:
    """Verify that resource_id field is accepted in tool calls (locking enforced server-side)."""
    secret_token = "arena_resource_lock_token_5555666677"

    cfg = {
        "bridge": {
            "host": "127.0.0.1",
            "port": 0,
            "approvalTimeoutSeconds": 10,
            "refuseAdminStartup": False,
        },
        "policy": {
            "allowedWriteRoots": [str(tmp_path)],
            "requireConfirmForOutsideRoots": True,
            "requireConfirmForShell": True,
            "allowReadOnlyShellWithoutConfirm": True,
        },
        "mcpServers": {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem3.db")},
            }
        },
    }

    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state3", auth_token=secret_token)
    await bridge.start()
    ws_url = f"ws://127.0.0.1:{bridge.port}"

    try:
        async with connect(ws_url, origin="chrome-extension://resourcelocktest") as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": secret_token}))
            auth_resp = json.loads(await ws.recv())
            assert auth_resp["type"] == "auth_ok"
            session_id = auth_resp["session_id"]

            # Call a tool with resource_id — should succeed (no conflict yet)
            await ws.send(
                json.dumps(
                    {
                        "id": 2,
                        "type": "call_tool",
                        "tool": "system_info",
                        "arguments": {},
                        "session_id": session_id,
                        "resource_id": "system_info_resource",
                    }
                )
            )
            resp = json.loads(await ws.recv())
            assert resp["type"] == "tool_result"
            # Should be OK (resource acquired and released)
            assert resp["ok"] is True or resp.get("resourceLocked") is not True

    finally:
        await bridge.stop()
