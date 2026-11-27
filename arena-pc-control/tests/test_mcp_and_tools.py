"""Real stdio integration tests for BuiltinPCServer + MCPStdioClient + MCPRouter."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.mcp_client import MCPRouter  # noqa: E402


class _DemoHTMLHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        body = (
            "<html><head><script>var secret='ignore';</script></head>"
            "<body><h1>Arena Local Web Test</h1>"
            "<p>Structured readable page content.</p>"
            "<a href='https://www.youtube.com/watch?v=dQw4w9WgXcQ'>Demo Video</a>"
            "</body></html>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        return


def test_mcp_router_filesystem_shell_web_memory_and_crash_recovery(tmp_path: Path) -> None:
    mem_db = tmp_path / "mcp_mem.db"
    router = MCPRouter(base_dir=ROOT)
    router.load_servers(
        {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(mem_db)},
            }
        }
    )

    statuses = router.start_all()
    try:
        assert "online" in statuses["local_pc"]
        tool_names = {t["name"] for t in router.list_tools()}
        assert {
            "system_info",
            "fs_write",
            "fs_read",
            "fs_edit",
            "fs_move",
            "fs_list",
            "fs_delete",
            "shell_exec",
            "web_fetch_readable",
            "memory_save",
            "memory_recall",
        }.issubset(tool_names)

        # 1. File create -> edit -> move -> read -> recovery_hint on bad edit
        doc = tmp_path / "project" / "todo.txt"
        w_res = router.call_tool("fs_write", {"path": str(doc), "content": "alpha\nbeta\ngamma\n"})
        assert w_res["ok"] is True

        bad_edit = router.call_tool(
            "fs_edit",
            {"path": str(doc), "old_text": "nonexistent_line", "new_text": "delta"},
        )
        assert bad_edit["ok"] is False
        assert "recovery_hint" in json.loads(bad_edit["text"])

        good_edit = router.call_tool(
            "fs_edit",
            {"path": str(doc), "old_text": "beta", "new_text": "beta_verified"},
        )
        assert good_edit["ok"] is True

        moved = tmp_path / "project" / "organized" / "todo_final.txt"
        mv_res = router.call_tool("fs_move", {"source": str(doc), "destination": str(moved)})
        assert mv_res["ok"] is True

        r_res = router.call_tool("fs_read", {"path": str(moved)})
        assert r_res["ok"] is True
        assert "2: beta_verified" in json.loads(r_res["text"])["content"]

        # 2. Shell success + failure observation
        ok_sh = router.call_tool("shell_exec", {"command": "echo HELLO_ARENA_BRIDGE"})
        assert ok_sh["ok"] is True
        assert "HELLO_ARENA_BRIDGE" in json.loads(ok_sh["text"])["stdout"]

        fail_sh = router.call_tool("shell_exec", {"command": "exit 7"})
        assert fail_sh["ok"] is False
        fail_payload = json.loads(fail_sh["text"])
        assert fail_payload["exit_code"] == 7
        assert "recovery_hint" in fail_payload

        # 3. Local HTTP webpage readable fetch
        httpd = HTTPServer(("127.0.0.1", 0), _DemoHTMLHandler)
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        try:
            web_res = router.call_tool(
                "web_fetch_readable",
                {"url": f"http://127.0.0.1:{port}/"},
            )
            assert web_res["ok"] is True
            web_data = json.loads(web_res["text"])
            assert "Arena Local Web Test" in web_data["content"]
            assert "ignore" not in web_data["content"]  # <script> stripped!
            assert web_data["links"][0]["text"] == "Demo Video"
        finally:
            httpd.shutdown()

        # 4. Persistent memory over MCP
        router.call_tool(
            "memory_save",
            {"project": "pc_setup", "key": "editor", "value": "VS Code"},
        )
        mem_res = router.call_tool("memory_recall", {"project": "pc_setup"})
        assert "VS Code" in mem_res["text"]

        # 5. Crash auto-recovery: kill child MCP server and verify next tool call self-heals!
        client = router.clients["local_pc"]
        assert client.proc is not None
        client.proc.kill()
        client.proc.wait(timeout=5)
        assert not client.is_running()

        healed = router.call_tool("system_info", {})
        assert healed["ok"] is True
        assert client.is_running()
    finally:
        router.stop_all()


def test_multi_mcp_server_aggregation_and_collision_namespacing(tmp_path: Path) -> None:
    external_mcp_script = tmp_path / "external_browser_mcp.py"
    external_mcp_script.write_text(
        """import json, sys
for line in sys.stdin:
    msg = json.loads(line)
    rid = msg.get("id")
    if rid is None:
        continue
    m = msg.get("method")
    if m == "initialize":
        out = {"jsonrpc": "2.0", "id": rid, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "ext", "version": "1.0"}}}
    elif m == "tools/list":
        out = {"jsonrpc": "2.0", "id": rid, "result": {"tools": [
            {"name": "browser_navigate", "description": "Navigate browser", "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}}},
            {"name": "system_info", "description": "Colliding tool name", "inputSchema": {"type": "object", "properties": {}}}
        ]}}
    elif m == "tools/call":
        name = msg["params"]["name"]
        args = msg["params"].get("arguments", {})
        out = {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": f"ext:{name}:{args.get('url', 'ok')}"}], "isError": False}}
    sys.stdout.write(json.dumps(out) + "\\n")
    sys.stdout.flush()
""",
        encoding="utf-8",
    )

    router = MCPRouter(base_dir=ROOT)
    router.load_servers(
        {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "m.db")},
            },
            "ext_browser": {
                "enabled": True,
                "command": str(external_mcp_script),
                "args": [],
            },
        }
    )
    router.start_all()
    try:
        names = {t["name"] for t in router.list_tools()}
        assert "browser_navigate" in names
        # Colliding 'system_info' on second server is exposed under 'ext_browser/system_info'
        assert "system_info" in names
        assert "ext_browser/system_info" in names

        nav = router.call_tool("browser_navigate", {"url": "https://www.youtube.com"})
        assert nav["ok"] is True
        assert nav["text"] == "ext:browser_navigate:https://www.youtube.com"

        ext_sys = router.call_tool("ext_browser/system_info", {})
        assert ext_sys["text"] == "ext:system_info:ok"
    finally:
        router.stop_all()
