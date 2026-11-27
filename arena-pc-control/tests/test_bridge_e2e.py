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
                json.dumps({
                    "id": 4,
                    "type": "call_tool",
                    "tool": "fs_write",
                    "arguments": {"path": str(target_file), "content": "verified content"},
                })
            )
            write_res = json.loads(await ws.recv())
            assert write_res["type"] == "tool_result"
            assert write_res["ok"] is True
            assert target_file.read_text(encoding="utf-8") == "verified content"

            # 4. DENY action (privilege escalation) is blocked immediately
            await ws.send(
                json.dumps({
                    "id": 5,
                    "type": "call_tool",
                    "tool": "shell_exec",
                    "arguments": {"command": "Start-Process cmd -Verb RunAs"},
                })
            )
            deny_res = json.loads(await ws.recv())
            assert deny_res["ok"] is False
            assert deny_res.get("policyBlocked") is True

            # 5. CONFIRM action (fs_delete): first DENY by human -> file stays intact!
            await ws.send(
                json.dumps({
                    "id": 6,
                    "type": "call_tool",
                    "tool": "fs_delete",
                    "arguments": {"path": str(target_file)},
                })
            )
            approval_req_1 = json.loads(await ws.recv())
            assert approval_req_1["type"] == "approval_required"
            aid_1 = approval_req_1["approval"]["id"]

            await ws.send(
                json.dumps({
                    "id": 7,
                    "type": "approval_decision",
                    "approval_id": aid_1,
                    "approved": False,
                })
            )
            frames = [json.loads(await ws.recv()), json.loads(await ws.recv())]
            tool_out_1 = next(f for f in frames if f["type"] == "tool_result")
            assert tool_out_1["ok"] is False
            assert tool_out_1.get("userDenied") is True
            assert target_file.exists()  # Not deleted!

            # 6. CONFIRM action (fs_delete): now APPROVE by human -> file is deleted!
            await ws.send(
                json.dumps({
                    "id": 8,
                    "type": "call_tool",
                    "tool": "fs_delete",
                    "arguments": {"path": str(target_file)},
                })
            )
            approval_req_2 = json.loads(await ws.recv())
            aid_2 = approval_req_2["approval"]["id"]

            await ws.send(
                json.dumps({
                    "id": 9,
                    "type": "approval_decision",
                    "approval_id": aid_2,
                    "approved": True,
                })
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
