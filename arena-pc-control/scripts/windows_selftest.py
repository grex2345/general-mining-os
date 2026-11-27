#!/usr/bin/env python3
"""Measurable Self-Test & Windows Capability Verifier.

Run on Windows (or Linux/macOS for cross-platform checks):
    python scripts/windows_selftest.py
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.mcp_client import MCPStdioClient  # noqa: E402


def main() -> int:
    print("=== Arena PC Control — Live Self-Test ===")
    client = MCPStdioClient(
        server_id="local_pc",
        command="bridge/builtin_mcp_server.py",
        base_dir=ROOT,
    )
    failures = 0
    try:
        client.start()
        print(f"[PASS] MCP stdio handshake ({len(client.tools)} tools registered)")

        sys_res = client.call_tool("system_info", {})
        sys_info = json.loads(sys_res["text"])
        print(f"[PASS] system_info -> OS={sys_info['os']} Python={sys_info['python']} Admin={sys_info['is_elevated_admin']}")

        with tempfile.TemporaryDirectory() as tmp:
            test_file = Path(tmp) / "probe.txt"
            client.call_tool("fs_write", {"path": str(test_file), "content": "line1\nline2\n"})
            client.call_tool("fs_edit", {"path": str(test_file), "old_text": "line2", "new_text": "line2_edited"})
            read_res = client.call_tool("fs_read", {"path": str(test_file)})
            assert "line2_edited" in read_res["text"]
            print("[PASS] fs_write + fs_edit + fs_read verified")

        sh_res = client.call_tool("shell_exec", {"command": "echo ARENA_SELFTEST_OK"})
        assert sh_res["ok"] and "ARENA_SELFTEST_OK" in sh_res["text"]
        print("[PASS] shell_exec non-elevated command verified")

        if sys.platform == "win32":
            win_res = client.call_tool("app_list_windows", {})
            if win_res["ok"]:
                wins = json.loads(win_res["text"]).get("windows", [])
                print(f"[PASS] Windows app_list_windows ({len(wins)} visible windows)")
            else:
                print(f"[FAIL] app_list_windows: {win_res['text']}")
                failures += 1

            cap_res = client.call_tool("screen_capture", {"max_width": 640})
            if cap_res["ok"] and len(cap_res["images"]) == 1:
                print(f"[PASS] Windows screen_capture ({len(cap_res['images'][0]['data'])} b64 chars)")
            else:
                print(f"[FAIL] Windows screen_capture: {cap_res['text']}")
                failures += 1
        else:
            print("[SKIP] Windows-only desktop GUI probes (current OS is not win32)")

    finally:
        client.stop()

    print("=========================================")
    print("RESULT:", "ALL CHECKS PASSED" if failures == 0 else f"{failures} CHECK(S) FAILED")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
