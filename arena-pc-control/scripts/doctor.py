#!/usr/bin/env python3
"""Diagnose an Arena PC Control installation and print the exact fix.

Run this first whenever something does not work:

    python scripts/doctor.py
    python scripts/doctor.py --port 18765 --deep

It checks, in order, everything that has to be true for the chain
Arena page -> extension -> bridge -> MCP server -> Windows to function, and prints
one line per check with a concrete remedy. Exit code 0 means "no blocking
problem found".
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
STATE_DIR = Path.home() / ".arena-pc-control"
TOKEN_FILE = STATE_DIR / "auth_token.txt"
CONFIG_DEFAULT = ROOT / "config.default.json"
CONFIG_LOCAL = ROOT / "config.local.json"
EXT_DIR = ROOT / "extension"

OK = "PASS"
WARN = "WARN"
FAIL = "FAIL"
SKIP = "SKIP"


class Doctor:
    def __init__(self, port: int | None, deep: bool) -> None:
        self.rows: list[tuple[str, str, str]] = []
        self.port_override = port
        self.deep = deep
        self.cfg: dict = {}

    def add(self, status: str, name: str, detail: str = "", fix: str = "") -> None:
        self.rows.append((status, name, detail))
        line = f"[{status}] {name}" + (f" - {detail}" if detail else "")
        print(line)
        if fix and status in (FAIL, WARN):
            for chunk in fix.splitlines():
                print(f"       -> {chunk}")

    # ── config ────────────────────────────────────────────────────────────
    def check_config(self) -> None:
        if not CONFIG_DEFAULT.exists():
            self.add(FAIL, "config.default.json", "missing", "Restore it from the project archive.")
            return
        try:
            self.cfg = json.loads(CONFIG_DEFAULT.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self.add(FAIL, "config.default.json", f"invalid JSON: {exc}", "Fix the JSON syntax error.")
            return
        if CONFIG_LOCAL.exists():
            try:
                local = json.loads(CONFIG_LOCAL.read_text(encoding="utf-8"))
                self.cfg = _deep_merge(self.cfg, local)
                self.add(OK, "config", "config.local.json overrides config.default.json")
            except json.JSONDecodeError as exc:
                self.add(FAIL, "config.local.json", f"invalid JSON: {exc}", "Fix or delete config.local.json.")
                return
        else:
            self.add(OK, "config", "config.default.json")

        bridge = self.cfg.get("bridge") or {}
        host = str(bridge.get("host", "127.0.0.1"))
        if host not in ("127.0.0.1", "localhost", "::1"):
            self.add(
                FAIL,
                "bridge.host",
                f"'{host}' exposes the bridge beyond loopback",
                "Set bridge.host to 127.0.0.1. Remote PC control must never be network-accessible.",
            )
        else:
            self.add(OK, "bridge.host", host)
        servers = self.cfg.get("mcpServers") or {}
        enabled = [sid for sid, spec in servers.items() if isinstance(spec, dict) and spec.get("enabled")]
        self.add(OK if "local_pc" in enabled else FAIL,
                 "MCP servers enabled",
                 ", ".join(enabled) or "none",
                 "" if "local_pc" in enabled else "Enable local_pc in config (the built-in Windows tool server).")

    # ── runtime ───────────────────────────────────────────────────────────
    def check_runtime(self) -> None:
        version = sys.version_info
        self.add(OK if version >= (3, 10) else FAIL, "Python", platform.python_version(),
                 "" if version >= (3, 10) else "Install Python 3.10 or newer.")
        self.add(OK if os.name == "nt" else SKIP, "Operating system",
                 f"{platform.system()} {platform.release()}",
                 "" if os.name == "nt" else "Windows-only desktop tools cannot run here.")
        if os.name == "nt" and _is_admin():
            self.add(FAIL, "privilege", "running elevated",
                     "Run the bridge as a standard user. Elevation is refused by design.")
        else:
            self.add(OK, "privilege", "standard user")

        for module, package in (("websockets", "websockets"), ("PIL", "pillow")):
            try:
                __import__(module)
                self.add(OK, f"dependency {package}", "importable")
            except ImportError:
                self.add(FAIL, f"dependency {package}", "not installed",
                         "python -m pip install -r requirements.txt")

        for binary, why in (("node", "optional: Playwright MCP / extension tests"),
                            ("uvx", "optional: CursorTouch Windows-MCP")):
            path = shutil.which(binary)
            self.add(OK if path else SKIP, binary, path or f"not installed ({why})")

    # ── extension ─────────────────────────────────────────────────────────
    def check_extension(self) -> None:
        manifest = EXT_DIR / "manifest.json"
        if not manifest.exists():
            self.add(FAIL, "extension/manifest.json", "missing", "Re-copy the extension folder.")
            return
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self.add(FAIL, "manifest.json", f"invalid JSON: {exc}")
            return
        self.add(OK, "extension manifest", f"v{data.get('manifest_version')} {data.get('name','')[:40]}")
        scripts = data.get("content_scripts", [{}])[0].get("js", [])
        ordered = ["protocol.js", "providers/base_adapter.js", "providers/arena_direct.js", "arena_adapter.js"]
        if scripts == ordered:
            self.add(OK, "content script order", " -> ".join(scripts))
        else:
            self.add(FAIL, "content script order", " -> ".join(scripts),
                     "Order must be: " + " -> ".join(ordered))
        missing = [p for p in scripts if not (EXT_DIR / p).exists()]
        self.add(FAIL if missing else OK, "content script files",
                 f"missing: {missing}" if missing else f"{len(scripts)} files present")
        perms = set(data.get("permissions") or [])
        needs = {"storage", "tabs"}
        self.add(OK if needs <= perms else FAIL, "extension permissions",
                 ", ".join(sorted(perms)),
                 "" if needs <= perms else f"Add {sorted(needs - perms)} to manifest permissions.")

        # Classic scripts must not contain ES module syntax.
        offenders = []
        for rel in scripts:
            path = EXT_DIR / rel
            if not path.exists():
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith(("import ", "export ")) or "await import(" in stripped:
                    offenders.append(f"{rel}:{number}")
        self.add(FAIL if offenders else OK, "classic-script syntax",
                 ", ".join(offenders) if offenders else "no ES module syntax",
                 "" if not offenders else "MV3 content scripts are classic scripts; import breaks the extension.")

    # ── bridge state ──────────────────────────────────────────────────────
    def check_state(self) -> None:
        if not TOKEN_FILE.exists():
            self.add(FAIL, "pairing token", f"missing at {TOKEN_FILE}",
                     "Start the bridge (start_windows.bat) once, or run:\n"
                     "start_windows.bat")
            return
        try:
            token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        except OSError as exc:
            self.add(FAIL, "pairing token", f"unreadable: {exc}")
            return
        if len(token) < 24:
            self.add(FAIL, "pairing token", f"too short ({len(token)} chars)",
                     "Delete the file and restart the bridge to regenerate it.")
        else:
            self.add(OK, "pairing token", f"{len(token)} characters at {TOKEN_FILE}")

        audit = STATE_DIR / "audit.jsonl"
        if audit.exists():
            size_kb = audit.stat().st_size / 1024
            self.add(OK, "audit log", f"{size_kb:.1f} KB at {audit}")
        else:
            self.add(WARN, "audit log", "not created yet (bridge has not run)")

        emergency = STATE_DIR / "emergency_stop.json"
        if emergency.exists():
            try:
                active = bool(json.loads(emergency.read_text(encoding="utf-8")).get("active"))
            except (json.JSONDecodeError, OSError):
                active = False
            if active:
                self.add(WARN, "emergency stop", "ACTIVE - all tool execution is halted",
                         "python scripts/emergency_stop.py --reset")
            else:
                self.add(OK, "emergency stop", "inactive")
        else:
            self.add(OK, "emergency stop", "never activated")

        lock = STATE_DIR / "bridge.lock"
        pid_file = STATE_DIR / "bridge.pid"
        if pid_file.exists():
            try:
                pid = int(pid_file.read_text(encoding="utf-8").strip())
                os.kill(pid, 0)
                self.add(OK, "bridge process", f"running (pid {pid})")
            except (OSError, ValueError):
                self.add(WARN, "bridge process", "pid file is stale",
                         "Delete ~/.arena-pc-control/bridge.pid if no bridge is running.")
        elif lock.exists():
            self.add(OK, "bridge lock", f"{lock.name} present")
        else:
            self.add(SKIP, "bridge process", "not started yet")

    # ── connectivity ──────────────────────────────────────────────────────
    def check_connectivity(self) -> None:
        bridge_cfg = self.cfg.get("bridge") or {}
        port = self.port_override or int(bridge_cfg.get("port", 18765))
        host = str(bridge_cfg.get("host", "127.0.0.1"))
        try:
            with socket.create_connection((host, port), timeout=2):
                self.add(OK, "port", f"{host}:{port} is open")
                open_port = True
        except OSError as exc:
            self.add(FAIL, "port", f"{host}:{port} unreachable ({exc.strerror or exc})",
                     "Start the bridge:\nstart_windows.bat")
            open_port = False

        if not open_port:
            return
        if not self.deep:
            self.add(SKIP, "bridge handshake", "use --deep to authenticate and list tools")
            return

        sys.path.insert(0, str(ROOT / "scripts"))
        import verify_bridge  # noqa: PLC0415

        ok, report = verify_bridge.run_verification(host=host, port=port, timeout=10, echo=False)
        if ok:
            self.add(OK, "bridge handshake", "authenticated, MCP tools listed")
        else:
            tail = [line for line in report.splitlines() if "FAIL" in line or "ERROR" in line.upper()]
            self.add(FAIL, "bridge handshake", tail[0] if tail else report.splitlines()[-1],
                     "Run python scripts/verify_bridge.py --port "
                     f"{port} for the full report.")

    def check_mcp(self) -> None:
        if not self.deep:
            self.add(SKIP, "MCP server", "use --deep to spawn the local_pc server")
            return
        try:
            from bridge.mcp_client import MCPStdioClient  # noqa: PLC0415
        except Exception as exc:  # noqa: BLE001
            self.add(FAIL, "MCP import", str(exc))
            return
        client = MCPStdioClient(
            server_id="local_pc",
            command="bridge/builtin_mcp_server.py",
            base_dir=ROOT,
            env={"ARENA_PC_MEMORY_DB": str(STATE_DIR / "doctor_memory.db")},
        )
        try:
            client.start()
            self.add(OK, "MCP server", f"local_pc online with {len(client.tools)} tools")
            info = client.call_tool("system_info", {})
            if info.get("ok"):
                payload = json.loads(info["text"])
                self.add(OK, "MCP tool call", f"system_info ok (screen={payload.get('screen')})")
            else:
                self.add(FAIL, "MCP tool call", (info.get("text") or "")[:120])
        except Exception as exc:  # noqa: BLE001
            self.add(FAIL, "MCP server", f"{type(exc).__name__}: {exc}",
                     "Run: python bridge/builtin_mcp_server.py to see the raw traceback.")
        finally:
            client.stop()

    def summary(self) -> int:
        failures = sum(1 for s, _, _ in self.rows if s == FAIL)
        warnings = sum(1 for s, _, _ in self.rows if s == WARN)
        print("=" * 70)
        if failures:
            print(f"RESULT: {failures} blocking problem(s), {warnings} warning(s). Fix the FAIL lines above.")
        elif warnings:
            print(f"RESULT: no blocking problems, {warnings} warning(s).")
        else:
            print("RESULT: everything needed for the Arena ? PC chain is in place.")
        print("=" * 70)
        return 1 if failures else 0


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _is_admin() -> bool:
    if os.name != "nt":
        return os.geteuid() == 0 if hasattr(os, "geteuid") else False
    try:
        import ctypes  # noqa: PLC0415

        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:  # noqa: BLE001
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Diagnose the Arena PC Control chain")
    parser.add_argument("--port", type=int, default=None, help="Override the bridge port")
    parser.add_argument("--deep", action="store_true",
                        help="Also authenticate against the bridge and spawn the MCP server")
    args = parser.parse_args(argv)

    print("Arena PC Control - diagnostics")
    print(f"Project root: {ROOT}")
    print(f"Python      : {sys.executable}")
    print("-" * 70)
    doctor = Doctor(args.port, args.deep)
    for step in (
        doctor.check_config,
        doctor.check_runtime,
        doctor.check_extension,
        doctor.check_state,
        doctor.check_connectivity,
        doctor.check_mcp,
    ):
        try:
            step()
        except Exception as exc:  # noqa: BLE001 - diagnostics must never crash
            doctor.add(FAIL, step.__name__, f"check crashed: {type(exc).__name__}: {exc}")
    return doctor.summary()


if __name__ == "__main__":
    raise SystemExit(main())
