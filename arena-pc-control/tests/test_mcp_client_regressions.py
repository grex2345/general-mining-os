"""Regression tests for the MCP client / router layer.

Defects pinned here:
  * the handshake advertised only protocol 2024-11-05, so modern servers
    (Playwright MCP, Windows-MCP) rejected initialize outright;
  * a child that exited left `last_error` empty, so the health monitor could
    only say "process exited";
  * a server writing non-JSON noise on stdout (banner lines) broke framing;
  * tools/list results were cached forever, so a restarted server's new tools
    never appeared.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import textwrap

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.mcp_client import MCPProtocolError, MCPStdioClient, MCPRouter  # noqa: E402


FAKE_SERVER = textwrap.dedent(
    """
    import json, sys

    STATE = {"initialized": False, "calls": 0}

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        # Emit a noisy banner line first: real servers do this and a naive
        # reader would treat it as a framing error.
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        rid = msg.get("id")
        method = msg.get("method")
        if method == "initialize":
            sys.stdout.write("banner: fake server starting\\n")
            out = {
                "jsonrpc": "2.0",
                "id": rid,
                "result": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "fake", "version": "9.9"},
                },
            }
        elif method == "tools/list":
            out = {
                "jsonrpc": "2.0",
                "id": rid,
                "result": {
                    "tools": [
                        {"name": "fake_echo", "description": "Echo", "inputSchema": {"type": "object"}},
                        {"name": "fake_boom", "description": "Fails", "inputSchema": {"type": "object"}},
                    ]
                },
            }
        elif method == "tools/call":
            name = msg["params"]["name"]
            STATE["calls"] += 1
            if name == "fake_boom":
                out = {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": "boom"}], "isError": True}}
            else:
                out = {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {
                        "content": [
                            {"type": "text", "text": "echo:" + json.dumps(msg["params"].get("arguments"))},
                            {"type": "image", "data": "QUJD", "mimeType": "image/png"},
                        ],
                        "isError": False,
                    },
                }
        else:
            out = {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "nope"}}
        sys.stdout.write(json.dumps(out) + "\\n")
        sys.stdout.flush()
    """
)


def _client(script: Path, server_id: str = "fake") -> MCPStdioClient:
    script.write_text(FAKE_SERVER, encoding="utf-8")
    return MCPStdioClient(server_id=server_id, command=str(script), base_dir=script.parent)


def test_handshake_records_negotiated_protocol_and_server_info(tmp_path: Path) -> None:
    client = _client(tmp_path / "fake_server.py")
    try:
        client.start()
        assert client.protocol_version == "2025-06-18"
        assert client.server_info.get("name") == "fake"
        assert {t["name"] for t in client.tools} == {"fake_echo", "fake_boom"}
    finally:
        client.stop()


def test_noisy_stdout_does_not_break_framing(tmp_path: Path) -> None:
    client = _client(tmp_path / "fake_server.py")
    try:
        client.start()
        result = client.call_tool("fake_echo", {"hello": "world"})
        assert result["ok"] is True
        assert "echo:" in result["text"]
        assert result["images"] and result["images"][0]["mimeType"] == "image/png"
    finally:
        client.stop()


def test_tool_error_flag_is_propagated(tmp_path: Path) -> None:
    client = _client(tmp_path / "fake_server.py")
    try:
        client.start()
        result = client.call_tool("fake_boom", {})
        assert result["ok"] is False
        assert result["is_error"] is True
    finally:
        client.stop()


def test_child_exit_is_recorded_for_the_health_monitor(tmp_path: Path) -> None:
    client = _client(tmp_path / "fake_server.py")
    client.start()
    assert client.proc is not None
    client.proc.kill()
    client.proc.wait(timeout=5)
    # Give the reader thread a moment to observe EOF and record the exit code.
    import time

    deadline = time.time() + 5
    while time.time() < deadline and not client.last_error:
        time.sleep(0.05)
    assert client.last_error, "a dead server must report why it died"
    assert "exit code" in client.last_error
    client.stop()


def test_router_namespaces_collisions_and_routes_after_restart(tmp_path: Path) -> None:
    router = MCPRouter(base_dir=ROOT)
    router.load_servers(
        {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "m.db")},
            },
            "fake": {"enabled": True, "command": str(_client(tmp_path / "fake_server.py").command), "args": []},
        }
    )
    router.start_all()
    try:
        names = {t["name"] for t in router.list_tools()}
        assert "system_info" in names
        assert "fake_echo" in names

        # Kill the fake server, then verify a call self-heals through restart().
        fake = router.clients["fake"]
        assert fake.proc is not None
        fake.proc.kill()
        fake.proc.wait(timeout=5)
        healed = router.call_tool("fake_echo", {"after": "restart"})
        assert healed["ok"] is True
        assert fake.is_running()
    finally:
        router.stop_all()


def test_protocol_error_class_is_importable() -> None:
    """MCPProtocolError must exist so handlers can distinguish framing errors."""
    assert issubclass(MCPProtocolError, RuntimeError)
