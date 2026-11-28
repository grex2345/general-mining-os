#!/usr/bin/env python3
"""Built-in Local PC MCP Server (JSON-RPC 2.0 over stdio).

Provides modular, structured tools for:
  1. Filesystem operations (list, read, atomic write, verified edit, move, mkdir, delete)
  2. Supervised Terminal / PowerShell execution (non-elevated, structured telemetry)
  3. Browser / Web reading & URL launching (plus seamless coexistence with @playwright/mcp)
  4. Persistent cross-session & project memory (SQLite)
  5. Windows 10/11 Desktop Control (window list/focus, app launch, UI Automation tree,
     mouse/keyboard input with top-left corner fail-safe, and screen capture)
"""

from __future__ import annotations

import base64
import ctypes
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time
from typing import Any
import urllib.request
import webbrowser

# Ensure sibling imports work when invoked as `python bridge/builtin_mcp_server.py`
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from bridge.memory import MemoryStore  # noqa: E402


IS_WINDOWS = sys.platform == "win32"


class _ReadableHTMLParser(HTMLParser):
    """Extracts clean visible text and top links from an HTML document."""

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.chunks: list[str] = []
        self.links: list[dict[str, str]] = []
        self._current_href: str | None = None
        self._current_link_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        if t in ("script", "style", "noscript", "svg"):
            self._skip_depth += 1
            return
        if t == "a" and self._skip_depth == 0:
            attr_map = dict(attrs)
            href = attr_map.get("href")
            if href and href.startswith(("http://", "https://")):
                self._current_href = href
                self._current_link_text = []

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in ("script", "style", "noscript", "svg") and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if t == "a" and self._current_href:
            label = " ".join("".join(self._current_link_text).split())
            if label and len(self.links) < 25:
                self.links.append({"text": label[:100], "url": self._current_href})
            self._current_href = None
            self._current_link_text = []
        if t in ("p", "div", "br", "li", "h1", "h2", "h3", "tr"):
            self.chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        cleaned = " ".join(data.split())
        if cleaned:
            self.chunks.append(cleaned + " ")
            if self._current_href is not None:
                self._current_link_text.append(cleaned)


_PS_ENCODING_PRELUDE = (
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
    "$OutputEncoding = [System.Text.Encoding]::UTF8; "
)


def _powershell(argv_ps: str) -> list[str]:
    """Build a PowerShell argv that always emits UTF-8 (non-ASCII paths)."""
    return [
        "powershell.exe",
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        _PS_ENCODING_PRELUDE + argv_ps,
    ]


def _is_elevated() -> bool:
    if IS_WINDOWS:
        try:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False
    if hasattr(os, "geteuid"):
        return os.geteuid() == 0
    return False


def _resolve_user_path(raw: str) -> Path:
    expanded = os.path.expandvars(os.path.expanduser(str(raw or "").strip()))
    return Path(expanded).resolve()


def _safe_json(raw: str, default: Any) -> Any:
    """Parse PowerShell JSON output, tolerating empty output and single objects."""
    text = (raw or "").strip()
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Some cmdlets emit one JSON document per line (no array wrapper).
        parsed: list[Any] = []
        for line in text.splitlines():
            line = line.strip().rstrip(",")
            if not line:
                continue
            try:
                parsed.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return parsed or default


def _json_text(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}]


class BuiltinPCServer:
    """Implements MCP tools/list and tools/call handlers."""

    def __init__(self, memory_db_path: str | None = None) -> None:
        db_override = memory_db_path or os.environ.get("ARENA_PC_MEMORY_DB")
        self.memory = MemoryStore(db_override)

    def tool_definitions(self) -> list[dict[str, Any]]:
        return [
            {
                "name": "system_info",
                "description": "Inspect OS version, Python runtime, non-admin status, and display info.",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "fs_list",
                "description": "List files and directories inside a local folder.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Directory path (supports ~)."},
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "fs_read",
                "description": "Read a UTF-8 text file with line numbers and optional line range.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "offset": {"type": "integer", "description": "1-based start line (default 1)."},
                        "limit": {"type": "integer", "description": "Max lines to read (default 200)."},
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "fs_write",
                "description": "Create or overwrite a text file atomically.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["path", "content"],
                },
            },
            {
                "name": "fs_edit",
                "description": "Replace exact old_text with new_text in an existing text file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "old_text": {"type": "string"},
                        "new_text": {"type": "string"},
                    },
                    "required": ["path", "old_text", "new_text"],
                },
            },
            {
                "name": "fs_move",
                "description": "Move or rename a file or directory.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "destination": {"type": "string"},
                    },
                    "required": ["source", "destination"],
                },
            },
            {
                "name": "fs_mkdir",
                "description": "Create a directory (and any missing parents).",
                "inputSchema": {
                    "type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"],
                },
            },
            {
                "name": "fs_delete",
                "description": "Delete a file or directory (requires user confirmation).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "recursive": {"type": "boolean", "default": False},
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "shell_exec",
                "description": "Execute a non-elevated PowerShell (Windows) or POSIX shell command and return structured stdout/stderr/exit_code.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string"},
                        "cwd": {"type": "string"},
                        "timeout_seconds": {"type": "integer", "default": 30},
                    },
                    "required": ["command"],
                },
            },
            {
                "name": "open_url",
                "description": "Open an http/https URL (e.g. YouTube search or website) in the default desktop browser.",
                "inputSchema": {
                    "type": "object",
                    "properties": {"url": {"type": "string"}},
                    "required": ["url"],
                },
            },
            {
                "name": "web_fetch_readable",
                "description": "Fetch an http/https webpage and extract clean readable text and links.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "max_chars": {"type": "integer", "default": 8000},
                    },
                    "required": ["url"],
                },
            },
            {
                "name": "app_list_windows",
                "description": "Windows 10/11: list visible desktop application windows (PID, process, title).",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "app_launch",
                "description": "Windows 10/11: launch an installed desktop application without admin elevation.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "application": {"type": "string", "description": "App executable or name (e.g. notepad, calc, msedge, code)."},
                        "args": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["application"],
                },
            },
            {
                "name": "app_focus_window",
                "description": "Windows 10/11: bring a window matching title_contains or pid to the foreground.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "title_contains": {"type": "string"},
                        "pid": {"type": "integer"},
                    },
                },
            },
            {
                "name": "ui_inspect_window",
                "description": "Windows 10/11: inspect interactive UI Automation (UIA) controls and coordinates in the active or named window.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "title_contains": {"type": "string"},
                        "max_elements": {"type": "integer", "default": 60},
                    },
                },
            },
            {
                "name": "screen_capture",
                "description": "Capture a compressed JPEG screenshot of the desktop (or region) for visual verification.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "region": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Optional [left, top, width, height].",
                        },
                        "max_width": {"type": "integer", "default": 1280},
                    },
                },
            },
            {
                "name": "input_mouse",
                "description": "Windows 10/11: move or click the mouse at (x, y) screen coordinates (aborts if cursor is at (0,0) fail-safe corner).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["move", "click", "right_click", "double_click", "scroll"],
                        },
                        "x": {"type": "integer"},
                        "y": {"type": "integer"},
                        "scroll_delta": {"type": "integer", "default": -120},
                    },
                    "required": ["action"],
                },
            },
            {
                "name": "input_keyboard",
                "description": "Windows 10/11: type text or send a keyboard shortcut (e.g. ctrl+l, enter, tab) to the active window.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "hotkey": {"type": "string"},
                    },
                },
            },
            {
                "name": "memory_save",
                "description": "Persist a verified fact, path, user preference, or task checkpoint across sessions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project": {"type": "string", "default": "global"},
                        "key": {"type": "string"},
                        "value": {"type": "string"},
                        "category": {"type": "string", "default": "fact"},
                    },
                    "required": ["key", "value"],
                },
            },
            {
                "name": "memory_recall",
                "description": "Recall stored project context and global preferences across sessions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project": {"type": "string", "default": "global"},
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 30},
                    },
                },
            },
            {
                "name": "memory_list_projects",
                "description": "List all projects stored in persistent memory.",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "memory_delete",
                "description": "Delete an outdated memory key.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project": {"type": "string", "default": "global"},
                        "key": {"type": "string"},
                    },
                    "required": ["key"],
                },
            },
        ]

    # ── Tool Dispatcher ───────────────────────────────────────────────────
    def call_tool(self, name: str, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        try:
            handler = getattr(self, f"_tool_{name}", None)
            if handler is None:
                return (
                    _json_text({
                        "ok": False,
                        "error": f"Unknown tool '{name}'.",
                        "recovery_hint": "Call tools/list or check exact tool name.",
                    }),
                    True,
                )
            return handler(args or {})
        except Exception as exc:
            return (
                _json_text({
                    "ok": False,
                    "error": f"{type(exc).__name__}: {exc}",
                    "recovery_hint": "Inspect parameters and paths, then retry with corrected arguments.",
                }),
                True,
            )

    # ── 1. System & Filesystem ────────────────────────────────────────────
    def _tool_system_info(self, _: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        screen = None
        if IS_WINDOWS:
            try:
                u32 = ctypes.windll.user32
                screen = {"width": int(u32.GetSystemMetrics(0)), "height": int(u32.GetSystemMetrics(1))}
            except Exception:
                screen = None
        return (
            _json_text({
                "ok": True,
                "os": platform.system(),
                "release": platform.release(),
                "version": platform.version(),
                "python": platform.python_version(),
                "is_elevated_admin": _is_elevated(),
                "screen": screen,
                "cwd": str(Path.cwd()),
            }),
            False,
        )

    def _tool_fs_list(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        target = _resolve_user_path(args.get("path", "."))
        if not target.exists():
            return (
                _json_text({
                    "ok": False,
                    "error": f"Directory does not exist: {target}",
                    "recovery_hint": "Check parent directory with fs_list first.",
                }),
                True,
            )
        if not target.is_dir():
            return (
                _json_text({
                    "ok": False,
                    "error": f"Path is a file, not a directory: {target}",
                    "recovery_hint": "Use fs_read to read file contents.",
                }),
                True,
            )
        entries = []
        for entry in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))[:250]:
            stat = entry.stat()
            entries.append({
                "name": entry.name,
                "type": "dir" if entry.is_dir() else "file",
                "size_bytes": stat.st_size if entry.is_file() else None,
            })
        return (_json_text({"ok": True, "path": str(target), "entries": entries}), False)

    def _tool_fs_read(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        target = _resolve_user_path(args["path"])
        if not target.exists() or not target.is_file():
            return (
                _json_text({
                    "ok": False,
                    "error": f"File not found: {target}",
                    "recovery_hint": "Verify filename using fs_list on the parent directory.",
                }),
                True,
            )
        text = target.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        offset = max(1, int(args.get("offset", 1)))
        limit = max(1, min(int(args.get("limit", 200)), 1000))
        sliced = lines[offset - 1 : offset - 1 + limit]
        numbered = "\n".join(f"{idx}: {line}" for idx, line in enumerate(sliced, start=offset))
        return (
            _json_text({
                "ok": True,
                "path": str(target),
                "total_lines": len(lines),
                "offset": offset,
                "returned_lines": len(sliced),
                "content": numbered,
            }),
            False,
        )

    def _tool_fs_write(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        target = _resolve_user_path(args["path"])
        content = str(args.get("content", ""))
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        tmp.write_text(content, encoding="utf-8")
        os.replace(tmp, target)
        return (
            _json_text({
                "ok": True,
                "path": str(target),
                "bytes_written": target.stat().st_size,
            }),
            False,
        )

    def _tool_fs_edit(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        target = _resolve_user_path(args["path"])
        old_text = str(args["old_text"])
        new_text = str(args["new_text"])
        if not target.exists() or not target.is_file():
            return (
                _json_text({
                    "ok": False,
                    "error": f"File not found: {target}",
                    "recovery_hint": "Read or create the file with fs_read / fs_write first.",
                }),
                True,
            )
        text = target.read_text(encoding="utf-8")
        occurrences = text.count(old_text)
        if occurrences == 0:
            return (
                _json_text({
                    "ok": False,
                    "error": "old_text was not found in the file.",
                    "recovery_hint": "Call fs_read first and copy exact lines for old_text.",
                }),
                True,
            )
        if occurrences > 1:
            return (
                _json_text({
                    "ok": False,
                    "error": f"old_text matched {occurrences} locations; must match exactly 1.",
                    "recovery_hint": "Include more surrounding lines in old_text to make it unique.",
                }),
                True,
            )
        updated = text.replace(old_text, new_text, 1)
        tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        tmp.write_text(updated, encoding="utf-8")
        os.replace(tmp, target)
        return (_json_text({"ok": True, "path": str(target), "replacements": 1}), False)

    def _tool_fs_move(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        src = _resolve_user_path(args["source"])
        dst = _resolve_user_path(args["destination"])
        if not src.exists():
            return (
                _json_text({
                    "ok": False,
                    "error": f"Source path does not exist: {src}",
                    "recovery_hint": "Check source path with fs_list.",
                }),
                True,
            )
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        return (_json_text({"ok": True, "source": str(src), "destination": str(dst)}), False)

    def _tool_fs_mkdir(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        target = _resolve_user_path(args["path"])
        target.mkdir(parents=True, exist_ok=True)
        return (_json_text({"ok": True, "path": str(target)}), False)

    def _tool_fs_delete(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        target = _resolve_user_path(args["path"])
        recursive = bool(args.get("recursive", False))
        if not target.exists():
            return (_json_text({"ok": False, "error": f"Path not found: {target}"}), True)
        if target.is_dir():
            if recursive:
                shutil.rmtree(target)
            else:
                target.rmdir()
        else:
            target.unlink()
        return (_json_text({"ok": True, "deleted": str(target)}), False)

    # ── 2. Supervised Shell / PowerShell ──────────────────────────────────
    def _tool_shell_exec(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        cmd = str(args.get("command", "")).strip()
        cwd_raw = args.get("cwd")
        cwd = str(_resolve_user_path(cwd_raw)) if cwd_raw else str(Path.cwd())
        timeout_s = max(1, min(int(args.get("timeout_seconds", 30)), 180))

        if IS_WINDOWS:
            argv = [
                "powershell.exe",
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                _PS_ENCODING_PRELUDE + cmd,
            ]
        else:
            argv = ["/bin/sh", "-c", cmd]

        t0 = time.monotonic()
        try:
            completed = subprocess.run(
                argv,
                cwd=cwd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_s,
                check=False,
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            ok = completed.returncode == 0
            payload: dict[str, Any] = {
                "ok": ok,
                "exit_code": completed.returncode,
                "duration_ms": elapsed_ms,
                "stdout": completed.stdout[:8000],
                "stderr": completed.stderr[:4000],
            }
            if not ok:
                payload["recovery_hint"] = (
                    "Inspect stderr and exit_code; verify command syntax and paths before retrying."
                )
            return (_json_text(payload), not ok)
        except subprocess.TimeoutExpired as exc:
            return (
                _json_text({
                    "ok": False,
                    "error": f"Command timed out after {timeout_s}s.",
                    "partial_stdout": (exc.stdout or "")[:3000],
                    "partial_stderr": (exc.stderr or "")[:3000],
                    "recovery_hint": "Avoid interactive or infinite-running commands in shell_exec.",
                }),
                True,
            )

    # ── 3. Web Navigation & Readable Fetch ────────────────────────────────
    def _tool_open_url(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        url = str(args.get("url", "")).strip()
        if not url.startswith(("http://", "https://")):
            return (
                _json_text({"ok": False, "error": "URL must start with http:// or https://"}),
                True,
            )
        opened = False
        try:
            if IS_WINDOWS:
                # ShellExecute hands the URL to the default browser unchanged;
                # webbrowser.open() splits on '&' and truncates query strings.
                os.startfile(url)  # type: ignore[attr-defined]  # noqa: S606
                opened = True
            else:
                opened = bool(webbrowser.open(url))
        except Exception as exc:  # noqa: BLE001
            return (
                _json_text({
                    "ok": False,
                    "error": f"Could not open URL: {exc}",
                    "recovery_hint": "Check that a default browser is configured.",
                }),
                True,
            )
        return (_json_text({"ok": True, "url": url, "browser_signaled": opened}), False)

    def _tool_web_fetch_readable(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        url = str(args.get("url", "")).strip()
        max_chars = max(500, min(int(args.get("max_chars", 8000)), 25000))
        if not url.startswith(("http://", "https://")):
            return (
                _json_text({"ok": False, "error": "URL must start with http:// or https://"}),
                True,
            )
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArenaPCControl/0.2",
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                ctype = resp.headers.get("Content-Type", "")
                charset = "utf-8"
                if "charset=" in ctype.lower():
                    charset = ctype.lower().split("charset=")[-1].split(";")[0].strip() or "utf-8"
                payload = resp.read(1_000_000)
        except Exception as exc:  # noqa: BLE001 - report any transport failure
            return (
                _json_text({
                    "ok": False,
                    "url": url,
                    "error": f"{type(exc).__name__}: {exc}",
                    "recovery_hint": (
                        "Verify the URL is reachable from this PC and uses http/https."
                    ),
                }),
                True,
            )
        try:
            raw = payload.decode(charset, errors="replace")
        except LookupError:
            raw = payload.decode("utf-8", errors="replace")
        if "html" in ctype.lower() or "<html" in raw[:500].lower():
            parser = _ReadableHTMLParser()
            parser.feed(raw)
            text = "".join(parser.chunks)
            # Collapse blank lines
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            clean_text = "\n".join(lines)[:max_chars]
            links = parser.links
        else:
            clean_text = raw[:max_chars]
            links = []
        return (
            _json_text({
                "ok": True,
                "url": url,
                "content": clean_text,
                "links": links,
            }),
            False,
        )

    # ── 4. Windows 10/11 Desktop, UIA, Input & Screenshots ────────────────
    def _require_windows(self, feature: str) -> tuple[list[dict[str, Any]], bool]:
        return (
            _json_text({
                "ok": False,
                "error": f"'{feature}' requires Windows 10/11 desktop session (current OS: {platform.system()}).",
                "recovery_hint": "Run the bridge on your Windows PC via start_windows.bat.",
            }),
            True,
        )

    def _tool_app_list_windows(self, _: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        if not IS_WINDOWS:
            return self._require_windows("app_list_windows")
        ps_script = (
            "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | "
            "Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress"
        )
        res = subprocess.run(
            _powershell(ps_script),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
        raw = res.stdout.strip()
        windows = _safe_json(raw, [])
        if isinstance(windows, dict):
            windows = [windows]
        return (_json_text({"ok": True, "windows": windows}), False)

    def _tool_app_launch(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        if not IS_WINDOWS:
            return self._require_windows("app_launch")
        app = str(args["application"]).strip()
        app_args = [str(a) for a in (args.get("args") or [])]
        # Non-elevated launch via Start-Process (never -Verb RunAs).
        cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command"]
        escaped_app = app.replace("'", "''")
        joined_args = ",".join("'" + a.replace("'", "''") + "'" for a in app_args)
        arg_list = f" -ArgumentList @({joined_args})" if app_args else ""
        # Apps such as notepad/calc/msedge are shell aliases, not files on PATH,
        # so Start-Process must be allowed to resolve them through App Paths.
        ps = (
            f"$p = Start-Process -FilePath '{escaped_app}'{arg_list} -PassThru;"
            " if ($p) { $p.Id } else { '' }"
        )
        res = subprocess.run(
            [*cmd, _PS_ENCODING_PRELUDE + ps],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=12,
            check=False,
        )
        if res.returncode != 0:
            detail = res.stderr.strip() or res.stdout.strip() or f"Could not launch '{app}'."
            return (
                _json_text({
                    "ok": False,
                    "error": detail,
                    "recovery_hint": (
                        "Use the executable name (notepad, calc, msedge) or a full .exe path. "
                        "Call app_list_windows to verify what is running."
                    ),
                }),
                True,
            )
        return (
            _json_text({"ok": True, "application": app, "pid": res.stdout.strip()}),
            False,
        )

    def _tool_app_focus_window(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        if not IS_WINDOWS:
            return self._require_windows("app_focus_window")
        title_sub = str(args.get("title_contains", "")).replace("'", "''")
        pid = args.get("pid")
        matcher = (
            f"$_.Id -eq {int(pid)}"
            if pid is not None
            else f"$_.MainWindowTitle -like '*{title_sub}*'"
        )
        ps = (
            "Add-Type @'\n"
            "using System; using System.Runtime.InteropServices;\n"
            "public class WinFocus {\n"
            "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);\n"
            "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);\n"
            "}\n"
            "'@\n"
            f"$p = Get-Process | Where-Object {{ $_.MainWindowHandle -ne 0 -and ({matcher}) }} | Select-Object -First 1;\n"
            "if (-not $p) { Write-Error 'Window not found'; exit 1 }\n"
            "[WinFocus]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null;\n"
            "[WinFocus]::SetForegroundWindow($p.MainWindowHandle) | Out-Null;\n"
            "$p | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress"
        )
        res = subprocess.run(
            _powershell(ps),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
        if res.returncode != 0:
            return (
                _json_text({
                    "ok": False,
                    "error": res.stderr.strip() or "Matching window not found.",
                    "recovery_hint": "Call app_list_windows first to see exact window titles and PIDs.",
                }),
                True,
            )
        return (_json_text({"ok": True, "focused": _safe_json(res.stdout.strip(), None)}), False)

    def _tool_ui_inspect_window(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        if not IS_WINDOWS:
            return self._require_windows("ui_inspect_window")
        title_sub = str(args.get("title_contains", "")).replace("'", "''")
        max_el = max(10, min(int(args.get("max_elements", 60)), 200))
        ps = (
            "Add-Type -AssemblyName UIAutomationClient;\n"
            "Add-Type -AssemblyName UIAutomationTypes;\n"
            "$root = [System.Windows.Automation.AutomationElement]::RootElement;\n"
            f"if ('{title_sub}' -ne '') {{\n"
            "  $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition);\n"
            f"  $target = $wins | Where-Object {{ $_.Current.Name -like '*{title_sub}*' }} | Select-Object -First 1;\n"
            "} else {\n"
            "  $target = [System.Windows.Automation.AutomationElement]::FocusedElement;\n"
            "}\n"
            "if (-not $target) { Write-Error 'Target UI window not found'; exit 1 }\n"
            "$els = $target.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition);\n"
            "$out = New-Object System.Collections.ArrayList;\n"
            "foreach ($e in $els) {\n"
            f"  if ($out.Count -ge {max_el}) {{ break }}\n"
            "  $n = $e.Current.Name; $ct = $e.Current.ControlType.ProgrammaticName; $r = $e.Current.BoundingRectangle;\n"
            "  if (($n -or $ct -match 'Edit|Button|CheckBox|ComboBox|MenuItem|TabItem') -and -not $r.IsEmpty) {\n"
            "    [void]$out.Add([PSCustomObject]@{ name=$n; type=$ct.Replace('ControlType.',''); x=[int]($r.X + $r.Width/2); y=[int]($r.Y + $r.Height/2); w=[int]$r.Width; h=[int]$r.Height })\n"
            "  }\n"
            "}\n"
            "ConvertTo-Json -InputObject @($out) -Compress"
        )
        res = subprocess.run(
            _powershell(ps),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
        )
        if res.returncode != 0:
            return (
                _json_text({
                    "ok": False,
                    "error": res.stderr.strip() or "Failed to read UI Automation tree.",
                    "recovery_hint": "Call app_list_windows to check active window titles, or use screen_capture.",
                }),
                True,
            )
        raw = res.stdout.strip()
        elements = _safe_json(raw, [])
        if isinstance(elements, dict):
            elements = [elements]
        return (_json_text({"ok": True, "elements": elements}), False)

    def _tool_screen_capture(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        try:
            from PIL import ImageGrab
        except ImportError:
            return (
                _json_text({"ok": False, "error": "Pillow is not installed (`pip install pillow`)."}),
                True,
            )
        region = args.get("region")
        bbox = None
        if region is not None:
            if not (isinstance(region, list) and len(region) == 4):
                return (
                    _json_text({
                        "ok": False,
                        "error": "region must be [left, top, width, height].",
                        "recovery_hint": "Omit region to capture the full desktop.",
                    }),
                    True,
                )
            try:
                left, top, width, height = (int(v) for v in region)
            except (TypeError, ValueError):
                return (
                    _json_text({"ok": False, "error": "region values must be integers."}),
                    True,
                )
            if width <= 0 or height <= 0:
                return (
                    _json_text({
                        "ok": False,
                        "error": f"region width/height must be positive (got {width}x{height}).",
                        "recovery_hint": "Use screen_capture without a region to see the full screen first.",
                    }),
                    True,
                )
            bbox = (left, top, left + width, top + height)
        try:
            img = ImageGrab.grab(bbox=bbox)
        except Exception as exc:
            return (
                _json_text({
                    "ok": False,
                    "error": f"Screen capture unavailable in current display session: {exc}",
                    "recovery_hint": "Ensure bridge is running inside an active interactive desktop session.",
                }),
                True,
            )
        orig_w, orig_h = img.size
        max_w = max(320, min(int(args.get("max_width", 1280)), 2560))
        if orig_w > max_w:
            ratio = max_w / float(orig_w)
            img = img.resize((max_w, int(orig_h * ratio)))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=78)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        meta = {
            "ok": True,
            "original_size": {"width": orig_w, "height": orig_h},
            "captured_size": {"width": img.size[0], "height": img.size[1]},
        }
        return (
            [
                {"type": "text", "text": json.dumps(meta)},
                {"type": "image", "data": b64, "mimeType": "image/jpeg"},
            ],
            False,
        )

    def _tool_input_mouse(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        if not IS_WINDOWS:
            return self._require_windows("input_mouse")
        u32 = ctypes.windll.user32

        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        pt = POINT()
        u32.GetCursorPos(ctypes.byref(pt))
        if pt.x == 0 and pt.y == 0:
            return (
                _json_text({
                    "ok": False,
                    "error": "Mouse fail-safe triggered: cursor is at (0, 0) top-left corner.",
                    "recovery_hint": "User moved mouse to corner to pause automation; ask before continuing.",
                }),
                True,
            )

        action = str(args["action"])
        x = args.get("x")
        y = args.get("y")
        if x is not None and y is not None:
            u32.SetCursorPos(int(x), int(y))
            time.sleep(0.03)

        # Win32 mouse_event flags
        LEFTDOWN, LEFTUP = 0x0002, 0x0004
        RIGHTDOWN, RIGHTUP = 0x0008, 0x0010
        WHEEL = 0x0800

        if action == "click":
            u32.mouse_event(LEFTDOWN, 0, 0, 0, 0)
            u32.mouse_event(LEFTUP, 0, 0, 0, 0)
        elif action == "double_click":
            for _ in range(2):
                u32.mouse_event(LEFTDOWN, 0, 0, 0, 0)
                u32.mouse_event(LEFTUP, 0, 0, 0, 0)
                time.sleep(0.04)
        elif action == "right_click":
            u32.mouse_event(RIGHTDOWN, 0, 0, 0, 0)
            u32.mouse_event(RIGHTUP, 0, 0, 0, 0)
        elif action == "scroll":
            delta = int(args.get("scroll_delta", -120))
            u32.mouse_event(WHEEL, 0, 0, delta, 0)

        u32.GetCursorPos(ctypes.byref(pt))
        return (_json_text({"ok": True, "action": action, "cursor": {"x": pt.x, "y": pt.y}}), False)

    def _tool_input_keyboard(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        if not IS_WINDOWS:
            return self._require_windows("input_keyboard")
        text = args.get("text")
        hotkey = args.get("hotkey")
        if not text and not hotkey:
            return (_json_text({"ok": False, "error": "Provide 'text' or 'hotkey'."}), True)

        if text:
            # SendKeys is unreliable for punctuation and non-ASCII text, so
            # send the string as a here-string and let .NET type it verbatim.
            body = str(text)
            esc = body.replace("'", "''").replace("@'", "@ ''").replace('@"', '@ ""')
            ps = (
                "$ws = New-Object -ComObject WScript.Shell;"
                f"$t = @'\n{esc}\n'@; foreach ($ch in $t.ToCharArray()) "
                "{ if ($ch -eq \"`n\") { $ws.SendKeys('{ENTER}') } "
                "else { $ws.SendKeys([string]$ch) } }"
            )
            res = subprocess.run(
                _powershell(ps),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
                check=False,
            )
            if res.returncode != 0:
                return (
                    _json_text({
                        "ok": False,
                        "error": res.stderr.strip() or "Keyboard input failed.",
                        "recovery_hint": "Focus the target window with app_focus_window first.",
                    }),
                    True,
                )
            return (_json_text({"ok": True, "sent_text": body}), False)
        else:
            hk = str(hotkey).lower().strip()
            mod_map = {"ctrl": "^", "control": "^", "alt": "%", "shift": "+"}
            key_map = {
                "enter": "{ENTER}",
                "return": "{ENTER}",
                "tab": "{TAB}",
                "esc": "{ESC}",
                "escape": "{ESC}",
                "backspace": "{BACKSPACE}",
                "delete": "{DELETE}",
                "up": "{UP}",
                "down": "{DOWN}",
                "left": "{LEFT}",
                "right": "{RIGHT}",
                "space": " ",
            }
            parts = [p.strip() for p in hk.split("+") if p.strip()]
            mods = "".join(mod_map[p] for p in parts[:-1] if p in mod_map)
            last = parts[-1]
            key_tok = key_map.get(last, f"{{{last.upper()}}}" if len(last) > 1 else last)
            send_seq = (mods + key_tok).replace("'", "''")

        ps = f"$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('{send_seq}')"
        res = subprocess.run(
            _powershell(ps),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
            check=False,
        )
        if res.returncode != 0:
            return (_json_text({"ok": False, "error": res.stderr.strip()}), True)
        return (_json_text({"ok": True, "sent": text or hotkey}), False)

    # ── 5. Persistent Memory ──────────────────────────────────────────────
    def _tool_memory_save(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        saved = self.memory.save(
            project=str(args.get("project", "global")),
            key=str(args["key"]),
            value=str(args["value"]),
            category=str(args.get("category", "fact")),
        )
        return (_json_text({"ok": True, "saved": saved}), False)

    def _tool_memory_recall(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        entries = self.memory.recall(
            project=args.get("project", "global"),
            query=args.get("query"),
            limit=int(args.get("limit", 30)),
        )
        return (_json_text({"ok": True, "count": len(entries), "entries": entries}), False)

    def _tool_memory_list_projects(self, _: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        return (_json_text({"ok": True, "projects": self.memory.list_projects()}), False)

    def _tool_memory_delete(self, args: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
        deleted = self.memory.delete(
            project=str(args.get("project", "global")),
            key=str(args["key"]),
        )
        return (_json_text({"ok": True, "deleted": deleted}), False)


def run_stdio_server() -> None:
    """Standard JSON-RPC 2.0 MCP loop reading stdin and writing stdout."""
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    server = BuiltinPCServer()

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        method = msg.get("method")
        req_id = msg.get("id")
        params = msg.get("params") or {}

        # Notifications have no id
        if req_id is None:
            continue

        if method == "initialize":
            reply = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "arena-local-pc-mcp", "version": "0.1.0"},
                },
            }
        elif method == "tools/list":
            reply = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"tools": server.tool_definitions()},
            }
        elif method == "tools/call":
            t_name = str(params.get("name", ""))
            t_args = params.get("arguments") or {}
            content, is_err = server.call_tool(t_name, t_args)
            reply = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": content, "isError": is_err},
            }
        elif method == "ping":
            reply = {"jsonrpc": "2.0", "id": req_id, "result": {}}
        else:
            reply = {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        sys.stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    run_stdio_server()
