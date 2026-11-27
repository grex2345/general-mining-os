"""End-to-end async WebSocket tests for BridgeServer security, auth, and approvals."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys

import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.server import BridgeServer  # noqa: E402


def test_refuses_non_loopback_host(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="non-loopback"):
        BridgeServer(
            {"bridge": {"host": "0.0.0.0", "port": 0}},
            base_dir=ROOT,
            state_dir=tmp_path,
            auth_token="test_secret_token_1234567890",
        )


@pytest.mark.asyncio
async def test_bridge_origin_guard_auth_and_human_approval_flow(tmp_path: Path) -> None:
    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    secret_token = "arena_test_secret_token_9876543210"

    cfg = {
        "bridge": {
            "host": "127.0.0.1",
            "port": 0,
            "approvalTimeoutSeconds": 10,
            "refuseAdminStartup": False,
        },
        "policy": {
            "allowedWriteRoots": [str(allowed_dir)],
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
        # 1. Malicious website Origin MUST be rejected at WebSocket handshake
        with pytest.raises(InvalidStatus):
            async with connect(ws_url, origin="https://malicious-site.example"):
                pass

        # 2. Chrome extension Origin is accepted, but unauthenticated calls are rejected
        async with connect(ws_url, origin="chrome-extension://abcdefghijklmnop") as ws:
            await ws.send(json.dumps({"id": 1, "type": "list_tools"}))
            unauth_reply = json.loads(await ws.recv())
            assert unauth_reply["type"] == "error"
            assert "Unauthenticated" in unauth_reply["error"]

            # Bad token rejected
            await ws.send(json.dumps({"id": 2, "type": "auth", "token": "wrong_token"}))
            bad_auth = json.loads(await ws.recv())
            assert bad_auth["type"] == "auth_error"

            # Valid token succeeds and returns MCP tool catalog
            await ws.send(json.dumps({"id": 3, "type": "auth", "token": secret_token}))
            good_auth = json.loads(await ws.recv())
            assert good_auth["type"] == "auth_ok"
            assert len(good_auth["tools"]) >= 15

            # 3. Safe ALLOW action executes immediately
            target_file = allowed_dir / "hello.txt"
            await ws.send(
                json.dumps(
                    {
                        "id": 4,
                        "type": "call_tool",
                        "tool": "fs_write",
                        "arguments": {"path": str(target_file), "content": "verified content"},
                    }
                )
            )
            write_res = json.loads(await ws.recv())
            assert write_res["type"] == "tool_result"
            assert write_res["ok"] is True
            assert target_file.read_text(encoding="utf-8") == "verified content"

            # 4. DENY action (privilege escalation) is blocked immediately
            await ws.send(
                json.dumps(
                    {
                        "id": 5,
                        "type": "call_tool",
                        "tool": "shell_exec",
                        "arguments": {"command": "Start-Process cmd -Verb RunAs"},
                    }
                )
            )
            deny_res = json.loads(await ws.recv())
            assert deny_res["ok"] is False
            assert deny_res.get("policyBlocked") is True

            # 5. CONFIRM action (fs_delete): first DENY by human -> file stays intact!
            await ws.send(
                json.dumps(
                    {
                        "id": 6,
                        "type": "call_tool",
                        "tool": "fs_delete",
                        "arguments": {"path": str(target_file)},
                    }
                )
            )
            approval_req_1 = json.loads(await ws.recv())
            assert approval_req_1["type"] == "approval_required"
            aid_1 = approval_req_1["approval"]["id"]

            await ws.send(
                json.dumps(
                    {
                        "id": 7,
                        "type": "approval_decision",
                        "approval_id": aid_1,
                        "approved": False,
                    }
                )
            )
            frames = [json.loads(await ws.recv()), json.loads(await ws.recv())]
            tool_out_1 = next(f for f in frames if f["type"] == "tool_result")
            assert tool_out_1["ok"] is False
            assert tool_out_1.get("userDenied") is True
            assert target_file.exists()  # Not deleted!

            # 6. CONFIRM action (fs_delete): now APPROVE by human -> file is deleted!
            await ws.send(
                json.dumps(
                    {
                        "id": 8,
                        "type": "call_tool",
                        "tool": "fs_delete",
                        "arguments": {"path": str(target_file)},
                    }
                )
            )
            approval_req_2 = json.loads(await ws.recv())
            aid_2 = approval_req_2["approval"]["id"]

            await ws.send(
                json.dumps(
                    {
                        "id": 9,
                        "type": "approval_decision",
                        "approval_id": aid_2,
                        "approved": True,
                    }
                )
            )
            frames_2 = [json.loads(await ws.recv()), json.loads(await ws.recv())]
            tool_out_2 = next(f for f in frames_2 if f["type"] == "tool_result")
            assert tool_out_2["ok"] is True
            assert not target_file.exists()

            # 7. Audit log recorded events
            audit_lines = bridge.audit_path.read_text(encoding="utf-8").strip().splitlines()
            events = [json.loads(line)["event"] for line in audit_lines]
            assert "auth_failed" in events
            assert "tool_denied_policy" in events
            assert "approval_requested" in events
            assert "approval_resolved" in events
            assert "tool_executed" in events
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_approval_ownership_rejects_foreign_session(tmp_path: Path) -> None:
    """Security: only the WS that requested an approval can approve/deny it.

    Two authenticated clients connect. Client A triggers a CONFIRM-tier tool.
    Client B must NOT be able to approve Client A's request.
    """
    secret_token = "arena_approval_ownership_token_1234567890"
    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    cfg = {
        "bridge": {"host": "127.0.0.1", "port": 0, "approvalTimeoutSeconds": 5, "refuseAdminStartup": False},
        "policy": {"allowedWriteRoots": [str(allowed_dir)], "requireConfirmForOutsideRoots": True, "requireConfirmForShell": True, "allowReadOnlyShellWithoutConfirm": True},
        "mcpServers": {"local_pc": {"enabled": True, "command": "bridge/builtin_mcp_server.py", "args": [], "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem_ownership.db")}}},
    }
    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state_own", auth_token=secret_token)
    await bridge.start()
    ws_url = f"ws://127.0.0.1:{bridge.port}"
    try:
        async with connect(ws_url, origin="chrome-extension://clientAaaaaaaaaa") as ws_a:
            await ws_a.send(json.dumps({"id": 1, "type": "auth", "token": secret_token}))
            auth_a = json.loads(await ws_a.recv())
            assert auth_a["type"] == "auth_ok"
            session_a = auth_a["session_id"]
            async with connect(ws_url, origin="chrome-extension://clientBbbbbbbbbb") as ws_b:
                await ws_b.send(json.dumps({"id": 2, "type": "auth", "token": secret_token}))
                auth_b = json.loads(await ws_b.recv())
                assert auth_b["type"] == "auth_ok"
                session_b = auth_b["session_id"]
                assert session_b != session_a
                target_file = allowed_dir / "owned_by_a.txt"
                target_file.write_text("client A data", encoding="utf-8")
                await ws_a.send(json.dumps({"id": 10, "type": "call_tool", "tool": "fs_delete", "arguments": {"path": str(target_file)}, "session_id": session_a}))
                approval_req = json.loads(await ws_a.recv())
                assert approval_req["type"] == "approval_required"
                aid = approval_req["approval"]["id"]
                await ws_b.send(json.dumps({"id": 20, "type": "approval_decision", "approval_id": aid, "approved": True}))
                ack_b = json.loads(await ws_b.recv())
                assert ack_b["type"] == "error"
                assert "Not authorized" in ack_b["error"]
                assert target_file.exists(), "Foreign session must not be able to approve"
                await ws_a.send(json.dumps({"id": 30, "type": "approval_decision", "approval_id": aid, "approved": False}))
                frames = [json.loads(await ws_a.recv()), json.loads(await ws_a.recv())]
                tool_out = next(f for f in frames if f["type"] == "tool_result")
                assert tool_out["ok"] is False
                assert tool_out.get("userDenied") is True
                assert target_file.exists()
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_e2e_full_tool_call_flow_with_approval(tmp_path: Path) -> None:
    """End-to-end: Arena Agent -> tool call -> approval -> execution -> result.

    Full cycle:
    1. Client authenticates and creates session
    2. Client calls a CONFIRM-tier tool (fs_write outside allowed root)
    3. Bridge sends approval_required to the client
    4. Client approves
    5. Bridge executes the tool and returns result
    6. Client verifies the file was actually written
    """
    secret_token = "arena_e2e_full_flow_token_9876543210"
    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir()
    cfg = {
        "bridge": {"host": "127.0.0.1", "port": 0, "approvalTimeoutSeconds": 10, "refuseAdminStartup": False},
        "policy": {"allowedWriteRoots": [str(allowed_dir)], "requireConfirmForOutsideRoots": True, "requireConfirmForShell": True, "allowReadOnlyShellWithoutConfirm": True},
        "mcpServers": {"local_pc": {"enabled": True, "command": "bridge/builtin_mcp_server.py", "args": [], "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem_e2e.db")}}},
    }
    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state_e2e", auth_token=secret_token)
    await bridge.start()
    ws_url = f"ws://127.0.0.1:{bridge.port}"
    try:
        async with connect(ws_url, origin="chrome-extension://e2eflowtest") as ws:
            # 1. Authenticate
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": secret_token}))
            auth_resp = json.loads(await ws.recv())
            assert auth_resp["type"] == "auth_ok"
            session_id = auth_resp["session_id"]

            # 2. List tools to verify MCP router is working
            await ws.send(json.dumps({"id": 2, "type": "list_tools"}))
            tools_resp = json.loads(await ws.recv())
            assert tools_resp["type"] == "tools_result"
            tool_names = {t["name"] for t in tools_resp["tools"]}
            assert "system_info" in tool_names
            assert "fs_write" in tool_names
            assert "fs_read" in tool_names

            # 3. Call system_info (ALLOW tier - should execute immediately)
            await ws.send(json.dumps({"id": 3, "type": "call_tool", "tool": "system_info", "arguments": {}, "session_id": session_id}))
            sys_resp = json.loads(await ws.recv())
            assert sys_resp["type"] == "tool_result"
            assert sys_resp["ok"] is True
            assert sys_resp["session_id"] == session_id
            sys_data = json.loads(sys_resp["text"])
            assert "os" in sys_data
            assert "python" in sys_data

            # 4. Call fs_write outside allowed root (CONFIRM tier - needs approval)
            target_file = outside_dir / "e2e_test.txt"
            await ws.send(json.dumps({"id": 4, "type": "call_tool", "tool": "fs_write", "arguments": {"path": str(target_file), "content": "E2E verification content"}, "session_id": session_id}))
            approval_req = json.loads(await ws.recv())
            assert approval_req["type"] == "approval_required"
            assert approval_req["approval"]["tool"] == "fs_write"
            assert approval_req["approval"]["session_id"] == session_id
            aid = approval_req["approval"]["id"]

            # 5. Approve the request
            await ws.send(json.dumps({"id": 5, "type": "approval_decision", "approval_id": aid, "approved": True}))
            frames = [json.loads(await ws.recv()), json.loads(await ws.recv())]
            tool_out = next(f for f in frames if f["type"] == "tool_result")
            assert tool_out["ok"] is True
            assert tool_out["session_id"] == session_id

            # 6. Verify the file was actually written
            assert target_file.read_text(encoding="utf-8") == "E2E verification content"

            # 7. Read the file back via fs_read
            await ws.send(json.dumps({"id": 6, "type": "call_tool", "tool": "fs_read", "arguments": {"path": str(target_file)}, "session_id": session_id}))
            read_resp = json.loads(await ws.recv())
            assert read_resp["ok"] is True
            assert "E2E verification content" in read_resp["text"]

            # 8. Clean up: delete the file (CONFIRM tier again)
            await ws.send(json.dumps({"id": 7, "type": "call_tool", "tool": "fs_delete", "arguments": {"path": str(target_file)}, "session_id": session_id}))
            approval_req_2 = json.loads(await ws.recv())
            assert approval_req_2["type"] == "approval_required"
            aid_2 = approval_req_2["approval"]["id"]

            await ws.send(json.dumps({"id": 8, "type": "approval_decision", "approval_id": aid_2, "approved": True}))
            frames_2 = [json.loads(await ws.recv()), json.loads(await ws.recv())]
            delete_out = next(f for f in frames_2 if f["type"] == "tool_result")
            assert delete_out["ok"] is True
            assert not target_file.exists()

    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_e2e_bridge_health_and_port_listening(tmp_path: Path) -> None:
    """Verify the Bridge starts, listens on the configured port, and responds."""
    secret_token = "arena_health_check_token_5555666677"
    cfg = {
        "bridge": {"host": "127.0.0.1", "port": 0, "approvalTimeoutSeconds": 10, "refuseAdminStartup": False},
        "policy": {"allowedWriteRoots": [str(tmp_path)], "requireConfirmForOutsideRoots": True, "requireConfirmForShell": True, "allowReadOnlyShellWithoutConfirm": True},
        "mcpServers": {"local_pc": {"enabled": True, "command": "bridge/builtin_mcp_server.py", "args": [], "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem_health.db")}}},
    }
    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state_health", auth_token=secret_token)
    statuses = await bridge.start()
    try:
        assert bridge.port > 0, "Bridge must bind to a real port"
        assert bridge.host == "127.0.0.1", "Bridge must bind to loopback only"
        assert "local_pc" in statuses
        assert "online" in statuses["local_pc"]
        ws_url = f"ws://127.0.0.1:{bridge.port}"
        async with connect(ws_url, origin="chrome-extension://healthcheck") as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": secret_token}))
            auth_resp = json.loads(await ws.recv())
            assert auth_resp["type"] == "auth_ok"
            assert len(auth_resp["tools"]) >= 15
            await ws.send(json.dumps({"id": 2, "type": "ping"}))
            pong = json.loads(await ws.recv())
            assert pong["type"] == "pong"
            assert pong["id"] == 2
            assert pong["authed"] is True
    finally:
        await bridge.stop()
