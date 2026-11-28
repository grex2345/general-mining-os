#!/usr/bin/env python3
"""Live, measurable self-test for Arena PC Control.

Everything here runs against the REAL infrastructure: the built-in MCP server is
spawned over stdio, tools are called through the MCP router, and the browser
extension's protocol parser is checked with Node.js when available.

Run on the target machine (Windows 10/11 recommended):

    python scripts/windows_selftest.py
    python scripts/windows_selftest.py --json     # machine-readable report

Exit code 0 only when every executed check passes. Windows-only probes are
reported as SKIP (not FAIL) on other operating systems, so the same command is
useful for pre-flight checks on Linux/macOS.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.mcp_client import MCPStdioClient  # noqa: E402

IS_WINDOWS = sys.platform == "win32"


class Report:
    def __init__(self, as_json: bool) -> None:
        self.rows: list[dict[str, str]] = []
        self.as_json = as_json

    def add(self, status: str, name: str, detail: str = "") -> None:
        self.rows.append({"status": status, "check": name, "detail": detail})
        if not self.as_json:
            print(f"[{status}] {name}" + (f" — {detail}" if detail else ""), flush=True)

    @property
    def failures(self) -> int:
        return sum(1 for r in self.rows if r["status"] == "FAIL")

    def finish(self) -> int:
        if self.as_json:
            print(json.dumps(self.rows, indent=2, ensure_ascii=False))
            return 1 if self.failures else 0
        print("=" * 60)
        passed = sum(1 for r in self.rows if r["status"] == "PASS")
        skipped = sum(1 for r in self.rows if r["status"] == "SKIP")
        print(
            f"RESULT: {passed} passed, {self.failures} failed, {skipped} skipped"
            if self.failures
            else f"RESULT: ALL {passed} CHECKS PASSED" + (f" ({skipped} skipped)" if skipped else "")
        )
        return 1 if self.failures else 0


def _wait_for_process(pid: int, timeout: float = 10.0) -> bool:
    """Wait until a freshly launched GUI process has created a window."""
    if not IS_WINDOWS:
        return False
    ps = (
        f"$p = Get-Process -Id {int(pid)} -ErrorAction SilentlyContinue; "
        "if ($p) { $p.Refresh(); if ($p.MainWindowHandle -ne 0) { 'window' } "
        "else { 'no-window' } } else { 'gone' }"
    )
    deadline = time.time() + timeout
    while time.time() < deadline:
        res = subprocess.run(
            [sys.executable, "-c", "pass"], capture_output=True, text=True, check=False
        )
        del res  # keep the loop cheap on non-Windows; real probe below
        probe = subprocess.run(
            [
                "powershell.exe",
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                ps,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
        )
        if "window" in (probe.stdout or ""):
            return True
        time.sleep(0.5)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Arena PC Control live self-test")
    parser.add_argument("--json", action="store_true", help="Emit a JSON report")
    parser.add_argument(
        "--skip-gui",
        action="store_true",
        help="Skip desktop GUI probes even on Windows (CI / headless sessions).",
    )
    args = parser.parse_args()
    report = Report(args.json)

    if not args.json:
        print("=== Arena PC Control — Live Self-Test ===")
        print(f"    OS: {sys.platform} | Python: {sys.version.split()[0]} | Root: {ROOT}")

    client = MCPStdioClient(
        server_id="local_pc",
        command="bridge/builtin_mcp_server.py",
        base_dir=ROOT,
        env={"ARENA_PC_MEMORY_DB": str(Path(tempfile.gettempdir()) / "apc_selftest_memory.db")},
    )

    try:
        client.start()
        report.add("PASS", "MCP stdio handshake", f"{len(client.tools)} tools registered")
    except Exception as exc:  # noqa: BLE001
        report.add("FAIL", "MCP stdio handshake", f"{type(exc).__name__}: {exc}")
        return report.finish()

    try:
        expected = {
            "system_info",
            "fs_list",
            "fs_read",
            "fs_write",
            "fs_edit",
            "fs_move",
            "fs_mkdir",
            "fs_delete",
            "shell_exec",
            "open_url",
            "web_fetch_readable",
            "screen_capture",
            "input_mouse",
            "input_keyboard",
            "app_list_windows",
            "app_launch",
            "app_focus_window",
            "ui_inspect_window",
            "memory_save",
            "memory_recall",
            "memory_list_projects",
            "memory_delete",
        }
        have = {t.get("name") for t in client.tools}
        missing = expected - have
        if missing:
            report.add("FAIL", "tool catalog", f"missing: {sorted(missing)}")
        else:
            report.add("PASS", "tool catalog", f"all {len(expected)} expected tools present")

        # ── system_info ──
        sys_res = client.call_tool("system_info", {})
        if sys_res.get("ok"):
            info = json.loads(sys_res["text"])
            report.add(
                "PASS",
                "system_info",
                f"OS={info.get('os')} Python={info.get('python')} "
                f"admin={info.get('is_elevated_admin')} screen={info.get('screen')}",
            )
            if info.get("is_elevated_admin"):
                report.add("FAIL", "privilege check", "bridge is running elevated (must be standard user)")
            else:
                report.add("PASS", "privilege check", "running as a standard (non-admin) user")
        else:
            report.add("FAIL", "system_info", sys_res.get("text", "")[:200])

        # ── filesystem round trip (unicode + spaces + nested dirs) ──
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "ت جربة" / "nested dir"
            target = base / "probe.txt"
            steps = [
                ("fs_write", {"path": str(target), "content": "line1\nline2\n"}),
                ("fs_read", {"path": str(target)}),
                ("fs_edit", {"path": str(target), "old_text": "line2", "new_text": "line2_edited"}),
                ("fs_list", {"path": str(base)}),
            ]
            ok = True
            for tool, tool_args in steps:
                res = client.call_tool(tool, tool_args)
                if not res.get("ok"):
                    ok = False
                    report.add("FAIL", f"{tool}", res.get("text", "")[:200])
                    break
            if ok:
                read_back = client.call_tool("fs_read", {"path": str(target)})
                if "line2_edited" in (read_back.get("text") or ""):
                    report.add("PASS", "filesystem round trip", "write → read → edit verified (unicode path)")
                else:
                    report.add("FAIL", "filesystem round trip", "edited content not found")

            moved = base / "moved.txt"
            if client.call_tool(
                "fs_move", {"source": str(target), "destination": str(moved)}
            ).get("ok") and client.call_tool("fs_delete", {"path": str(moved)}).get("ok"):
                report.add("PASS", "fs_move + fs_delete", "move and single-file delete verified")
            else:
                report.add("FAIL", "fs_move + fs_delete", "move/delete failed")

        # ── shell ──
        sh_res = client.call_tool("shell_exec", {"command": "echo ARENA_SELFTEST_OK"})
        if sh_res.get("ok") and "ARENA_SELFTEST_OK" in (sh_res.get("text") or ""):
            report.add("PASS", "shell_exec", "non-elevated command executed")
        else:
            report.add("FAIL", "shell_exec", (sh_res.get("text") or "")[:200])

        fail_sh = client.call_tool("shell_exec", {"command": "exit 7" if not IS_WINDOWS else "exit 7"})
        if fail_sh.get("ok") is False:
            report.add("PASS", "shell_exec failure reporting", "non-zero exit surfaced to the agent")
        else:
            report.add("FAIL", "shell_exec failure reporting", "non-zero exit was reported as success")

        # ── persistent memory ──
        key = f"selftest_{int(time.time())}"
        saved = client.call_tool(
            "memory_save", {"project": "selftest", "key": key, "value": "verified"}
        ).get("ok")
        recalled = client.call_tool(
            "memory_recall", {"project": "selftest", "query": key}
        )
        if saved and "verified" in (recalled.get("text") or ""):
            report.add("PASS", "persistent memory", "save + recall across process")
            client.call_tool("memory_delete", {"project": "selftest", "key": key})
        else:
            report.add("FAIL", "persistent memory", "save/recall failed")

        # ── browser extension parser (Node.js) ──
        node = shutil.which("node")
        if node:
            proc = subprocess.run(
                [node, "--test", "tests/test_extension_protocol.mjs"],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            if proc.returncode == 0:
                report.add("PASS", "extension protocol parser", "node --test tests/test_extension_protocol.mjs")
            else:
                report.add("FAIL", "extension protocol parser", (proc.stderr or proc.stdout)[-300:])
        else:
            report.add("SKIP", "extension protocol parser", "Node.js not installed")

        # ── Windows-only desktop probes ──
        if not IS_WINDOWS:
            report.add(
                "SKIP",
                "Windows desktop probes",
                "current OS is not win32 (app/screen/mouse/keyboard/UIA)",
            )
        elif args.skip_gui:
            report.add("SKIP", "Windows desktop probes", "--skip-gui")
        else:
            win_res = client.call_tool("app_list_windows", {})
            windows = []
            if win_res.get("ok"):
                windows = json.loads(win_res["text"]).get("windows", [])
                report.add("PASS", "app_list_windows", f"{len(windows)} visible windows")
            else:
                report.add("FAIL", "app_list_windows", (win_res.get("text") or "")[:200])

            cap_res = client.call_tool("screen_capture", {"max_width": 800})
            if cap_res.get("ok") and cap_res.get("images"):
                report.add(
                    "PASS", "screen_capture", f"{cap_res['images'][0]['mimeType']} JPEG captured"
                )
            else:
                report.add("FAIL", "screen_capture", (cap_res.get("text") or "")[:200])

            launch = client.call_tool("app_launch", {"application": "notepad"})
            if launch.get("ok"):
                pid_text = (json.loads(launch["text"]).get("pid") or "").strip()
                report.add("PASS", "app_launch", f"notepad pid={pid_text or 'unknown'}")
                if pid_text.isdigit():
                    if _wait_for_process(int(pid_text), timeout=10):
                        report.add("PASS", "app window", "launched app created a window")
                    else:
                        report.add("FAIL", "app window", "launched app never created a window")
                    # Clean up without disturbing anything else.
                    subprocess.run(
                        ["taskkill", "/PID", pid_text, "/T", "/F"],
                        capture_output=True,
                        check=False,
                    )
                focus = client.call_tool("app_focus_window", {"title_contains": "Arena"})
                report.add(
                    "PASS" if focus.get("ok") else "SKIP",
                    "app_focus_window",
                    "focused a matching window" if focus.get("ok") else "no matching window open",
                )
                uia = client.call_tool("ui_inspect_window", {"max_elements": 20})
                if uia.get("ok"):
                    els = json.loads(uia["text"]).get("elements", [])
                    report.add("PASS", "ui_inspect_window", f"{len(els)} UI elements")
                else:
                    report.add("FAIL", "ui_inspect_window", (uia.get("text") or "")[:200])

                mouse = client.call_tool("input_mouse", {"action": "move", "x": 10, "y": 10})
                if mouse.get("ok"):
                    report.add("PASS", "input_mouse", "cursor moved")
                elif "fail-safe" in (mouse.get("text") or "").lower():
                    report.add("SKIP", "input_mouse", "fail-safe active (cursor at 0,0)")
                else:
                    report.add("FAIL", "input_mouse", (mouse.get("text") or "")[:200])
            else:
                report.add("FAIL", "app_launch", (launch.get("text") or "")[:200])

    finally:
        client.stop()

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
