#!/usr/bin/env python3
"""Arena PC Control - one-command startup, implemented in Python.

WHY THIS FILE EXISTS
--------------------
The original launchers were large CMD scripts. CMD is a hostile parser:

  * UTF-8 punctuation (an em dash) on a `chcp 65001` console desynchronises the
    parser and CMD starts executing fragments of comment lines as commands
    ("'rena' is not recognized", "'This' is not recognized", ...).
  * `LF`-only line endings (what Git produces for a `.bat` without a
    `.gitattributes` rule) make every following line be swallowed into the
    previous command, which produces exactly the same class of garbage.
  * `%VAR%` expanded inside a `( )` block breaks the block when the value
    contains `)` or `&` - i.e. any path such as "C:\\Users\\Tom & Jerry\\...".
  * Multi-line `python -c "..."` is split into separate commands.

Instead of hardening that parser, we stop feeding it logic. Every `.bat` file in
this project is now a ~10 line, ASCII-only, CRLF, `goto`-based stub whose only
job is to find Python and call this file. Everything else happens here, in
Python, with argument lists instead of shell strings - so spaces, `&`, `(`,
`^`, Arabic text and long paths cannot break quoting.

This module must run on a *bare* Python (stdlib only) because it creates the
virtual environment and installs the dependencies.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
STATE_DIR = Path.home() / ".arena-pc-control"
TOKEN_FILE = STATE_DIR / "auth_token.txt"
PID_FILE = STATE_DIR / "bridge.pid"

IS_WINDOWS = os.name == "nt"
VENV = ROOT / ".venv"
VENV_PY = VENV / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")
DEFAULT_PORT = 18765

# Console output stays ASCII: a Windows console in cp1252/cp437 cannot encode
# "—" or Arabic, and a UnicodeEncodeError here would abort the launch.
OK, BAD, INFO = "[ OK ]", "[FAIL]", "[ -- ]"


def say(message: str = "", prefix: str | None = None) -> None:
    line = f"  {prefix} {message}" if prefix else f"  {message}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:  # exotic console code pages
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)


def warn(message: str) -> None:
    say(message, "  !   ")


def die(message: str, code: int = 1) -> "NoReturn":  # type: ignore[valid-type]
    print("", flush=True)
    say(message, BAD)
    print("", flush=True)
    raise SystemExit(code)


# ────────────────────────────────────────────────────────────────────────────
# Environment checks
# ────────────────────────────────────────────────────────────────────────────
def is_admin() -> bool:
    if IS_WINDOWS:
        try:
            import ctypes

            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:  # noqa: BLE001
            return False
    return hasattr(os, "geteuid") and os.geteuid() == 0


def check_admin() -> None:
    if is_admin():
        die(
            "SECURITY BLOCK: do not run this as Administrator.\n"
            "  The bridge must run as your normal user account.\n"
            "  Close this window and double-click the .bat file normally.",
            code=1,
        )
    say("running as a standard (non-admin) user", OK)


def check_python() -> None:
    if sys.version_info < (3, 10):
        die(
            f"Python 3.10 or newer is required (this is {sys.version.split()[0]}).\n"
            "  Install it from https://www.python.org/downloads/ and tick\n"
            '  "Add python.exe to PATH" during setup.'
        )
    say(f"Python {sys.version.split()[0]} ({sys.executable})", OK)


# ────────────────────────────────────────────────────────────────────────────
# Virtual environment
# ────────────────────────────────────────────────────────────────────────────
def python_for_venv() -> Path:
    """Interpreter inside .venv, creating the environment when missing."""
    if VENV_PY.exists():
        return VENV_PY
    say("creating .venv (first run only, this can take a minute) ...", INFO)
    result = subprocess.run(
        [sys.executable, "-m", "venv", str(VENV)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not VENV_PY.exists():
        detail = (result.stderr or result.stdout or "").strip()
        die(
            "could not create the virtual environment (.venv).\n"
            f"  python -m venv reported: {detail[:400]}\n"
            "  On Debian/Ubuntu install python3-venv; on Windows reinstall Python."
        )
    return VENV_PY


def deps_present(venv_python: Path) -> bool:
    probe = subprocess.run(
        [str(venv_python), "-c", "import websockets, PIL"],
        capture_output=True,
        text=True,
        check=False,
    )
    return probe.returncode == 0


def install_deps(venv_python: Path) -> None:
    if deps_present(venv_python):
        say("dependencies already installed", OK)
        return
    requirements = ROOT / "requirements.txt"
    if not requirements.exists():
        die(f"requirements.txt is missing from {ROOT}")
    say("installing dependencies (first run only) ...", INFO)
    subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--disable-pip-version-check",
         "--quiet", "--upgrade", "pip"],
        capture_output=True,
        check=False,
    )
    result = subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--disable-pip-version-check",
         "--quiet", "-r", str(requirements)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        die(
            "dependency installation failed.\n"
            f"  {venv_python} -m pip install -r {requirements}\n"
            f"  pip said: {(result.stderr or result.stdout or '').strip()[:600]}"
        )
    say("dependencies installed", OK)


# ────────────────────────────────────────────────────────────────────────────
# Port / token / process helpers
# ────────────────────────────────────────────────────────────────────────────
def port_open(host: str, port: int, timeout: float = 0.6) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_for_port(host: str, port: int, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(host, port):
            return True
        time.sleep(0.4)
    return False


def ensure_token() -> str:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    token = ""
    if TOKEN_FILE.exists():
        try:
            token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            token = ""
    if len(token) < 24:
        token = secrets.token_urlsafe(32)
        TOKEN_FILE.write_text(token + "\n", encoding="utf-8")
    if not IS_WINDOWS:
        try:
            TOKEN_FILE.chmod(0o600)
        except OSError:
            pass
    return token


def recorded_pid() -> int | None:
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    try:
        os.kill(pid, 0)
    except OSError:
        return None
    return pid


def kill_pid(pid: int) -> None:
    if IS_WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, check=False)
        return
    import signal

    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return


def free_port(host: str, port: int) -> None:
    """Stop whatever an earlier run left behind, including a stale bridge."""
    pid = recorded_pid()
    if pid:
        say(f"stopping a previous bridge (pid {pid}) ...", INFO)
        kill_pid(pid)
        PID_FILE.unlink(missing_ok=True)
    deadline = time.time() + 8
    while port_open(host, port) and time.time() < deadline:
        time.sleep(0.3)
    if not port_open(host, port):
        say(f"port {port} is free", OK)
        return
    # Something else holds the port (a bridge started by hand, another app).
    found = _pid_on_port(port)
    if found:
        warn(f"port {port} is held by pid {found}; stopping it")
        kill_pid(found)
        time.sleep(1.0)
    if port_open(host, port):
        die(
            f"port {port} is still in use and could not be freed.\n"
            "  Close the program using it, or change bridge.port in config.local.json."
        )
    say(f"port {port} is free", OK)


def _pid_on_port(port: int) -> int | None:
    if IS_WINDOWS:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, check=False).stdout
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[1].endswith(f":{port}") and parts[3].upper() == "LISTENING":
                if parts[4].isdigit():
                    return int(parts[4])
        return None
    tool = shutil.which("lsof") or shutil.which("ss")
    if tool and tool.endswith("lsof"):
        out = subprocess.run([tool, "-ti", f"tcp:{port}"], capture_output=True, text=True, check=False).stdout
        for token in out.split():
            if token.isdigit():
                return int(token)
    return None


# ────────────────────────────────────────────────────────────────────────────
# Bridge lifecycle
# ────────────────────────────────────────────────────────────────────────────
def config_path() -> Path:
    local = ROOT / "config.local.json"
    return local if local.exists() else ROOT / "config.default.json"


def bridge_port() -> int:
    try:
        cfg = json.loads(config_path().read_text(encoding="utf-8"))
        return int((cfg.get("bridge") or {}).get("port", DEFAULT_PORT))
    except (OSError, ValueError, json.JSONDecodeError):
        return DEFAULT_PORT


def bridge_host() -> str:
    try:
        cfg = json.loads(config_path().read_text(encoding="utf-8"))
        return str((cfg.get("bridge") or {}).get("host", "127.0.0.1"))
    except (OSError, ValueError, json.JSONDecodeError):
        return "127.0.0.1"


def start_bridge(venv_python: Path, host: str, port: int) -> int:
    log_dir = ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = log_dir / "bridge.stdout.log"
    stderr_path = log_dir / "bridge.stderr.log"
    for path in (stdout_path, stderr_path):
        path.unlink(missing_ok=True)

    cmd = [
        str(venv_python), "-u", str(ROOT / "bridge" / "server.py"),
        "--config", str(config_path()), "--port", str(port),
    ]
    creationflags = 0
    if IS_WINDOWS:
        creationflags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )
    with open(stdout_path, "wb") as out, open(stderr_path, "wb") as err:
        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdout=out,
            stderr=err,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
            start_new_session=(not IS_WINDOWS),
        )
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(proc.pid), encoding="utf-8")
    return proc.pid


def tail(path: Path, lines: int = 15) -> str:
    try:
        content = path.read_text(encoding="utf-8", errors="replace").strip().splitlines()
    except OSError:
        return "(no log)"
    return "\n".join(content[-lines:]) or "(empty)"


# ────────────────────────────────────────────────────────────────────────────
# Interpreter handoff
# ────────────────────────────────────────────────────────────────────────────
COMMANDS_NEEDING_VENV = {"start", "doctor", "selftest"}


def inside_venv() -> bool:
    """True when *this* process runs from .venv.

    Do NOT compare `sys.executable` with the venv's interpreter: on POSIX
    `.venv/bin/python` is a symlink to the system interpreter, so
    `.resolve()` makes the two look identical and the handoff is skipped
    (which is exactly how "websockets library is not installed" happened while
    pip had just installed it). `sys.prefix` is the venv directory itself.
    """
    if not VENV.exists():
        return False
    try:
        return Path(sys.prefix).resolve() == VENV.resolve()
    except OSError:
        return False


def reexec_in_venv_if_needed(command: str) -> int | None:
    """Re-run this file with the .venv interpreter when one is required.

    The stub .bat files invoke whatever Python they can find (often the system
    one, which has no `websockets`). Verification and the live checks import
    those packages, so the launcher hands itself over to the venv interpreter
    *once*. Without this, `pip install` succeeds and verification still fails
    with "websockets library is not installed".
    """
    if command not in COMMANDS_NEEDING_VENV:
        return None
    if os.environ.get("APC_LAUNCHER_REEXEC") == "1":
        return None  # already there (or the venv python is missing something)
    if not VENV_PY.exists():
        return None  # cmd_start creates it, then re-execs afterwards
    if inside_venv():
        return None
    say(f"switching to the isolated interpreter: {VENV_PY}", INFO)
    env = dict(os.environ, APC_LAUNCHER_REEXEC="1")
    return subprocess.run(
        [str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]], env=env, check=False
    ).returncode


# ────────────────────────────────────────────────────────────────────────────
# Commands
# ────────────────────────────────────────────────────────────────────────────
def validate_config() -> None:
    """Fail early and readable when config.local.json / config.default.json is broken.

    Without this the bridge exits with a raw JSONDecodeError traceback, which
    tells a user nothing about which file to fix.
    """
    path = config_path()
    if not path.exists():
        die(
            f"{path.name} is missing.\n"
            "  Restore it from the project archive (it ships with the project)."
        )
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        die(
            f"{path} is not valid JSON: {exc}.\n"
            f"  Line {exc.lineno}, column {exc.colno}.\n"
            "  Fix the syntax (a missing comma is the usual cause) or delete\n"
            "  config.local.json to fall back to the defaults."
        )
    except OSError as exc:
        die(f"{path} could not be read: {exc}")


def cmd_start(args: argparse.Namespace) -> int:
    say(f"project folder: {ROOT}", INFO)
    check_admin()
    check_python()
    venv_python = python_for_venv()
    say(f"virtual environment: {VENV}", OK)
    install_deps(venv_python)

    validate_config()
    host = args.host or bridge_host()
    port = args.port or bridge_port()

    if not inside_venv():
        # Everything below imports venv-only packages (websockets for the
        # verification handshake), so continue inside the venv interpreter.
        say("continuing inside the virtual environment", INFO)
        argv = [
            str(venv_python), str(Path(__file__).resolve()), "start",
            "--host", host, "--port", str(port), "--timeout", str(args.timeout),
        ]
        return subprocess.run(argv, env=dict(os.environ, APC_LAUNCHER_REEXEC="1"),
                              check=False).returncode

    say(f"bridge target: ws://{host}:{port}", INFO)

    free_port(host, port)
    token = ensure_token()
    say(f"pairing token ready ({len(token)} characters)", OK)

    pid = start_bridge(venv_python, host, port)
    say(f"bridge process started (pid {pid})", OK)
    say(f"waiting for {host}:{port} ...", INFO)

    if not wait_for_port(host, port, args.timeout):
        print("", flush=True)
        warn("the bridge did not open its port in time.")
        print(tail(ROOT / "logs" / "bridge.stderr.log"), flush=True)
        die(
            "Bridge startup failed.\n"
            f"  Full logs: {ROOT / 'logs' / 'bridge.stderr.log'}",
            code=1,
        )
    say("port is accepting connections", OK)

    # Full verification: WebSocket upgrade + token auth + MCP tool catalog.
    sys.path.insert(0, str(SCRIPTS))
    import verify_bridge  # noqa: PLC0415  (local import: keeps --help instant)

    ok, _ = verify_bridge.run_verification(host, port, timeout=15, echo=True)
    if not ok:
        die(
            "Bridge startup failed (verification did not pass).\n"
            f"  Logs: {ROOT / 'logs' / 'bridge.stderr.log'}",
            code=1,
        )

    print("", flush=True)
    say("=" * 68)
    say("SYSTEM READY")
    say("=" * 68)
    print("", flush=True)
    say("NEXT STEPS")
    say("1. Open Chrome or Edge.")
    say("2. Go to chrome://extensions  (or edge://extensions)")
    say('3. Turn on "Developer mode".')
    say('4. Click "Load unpacked" and select this folder:')
    say(f"     {ROOT / 'extension'}")
    say('5. Open the extension popup, paste the PAIRING TOKEN below,')
    say('   then click "Save & Pair Bridge".')
    say("6. Open https://arena.ai and click \"Start PC Session\".")
    print("", flush=True)
    say("PAIRING TOKEN")
    say("-" * 68)
    say(token)
    say("-" * 68)
    say(f"(also stored in {TOKEN_FILE})")
    print("", flush=True)
    say(f"Logs : {ROOT / 'logs'}")
    say(f"Audit: {STATE_DIR / 'audit.jsonl'}")
    say("The bridge keeps running in the background.")
    say("To stop it: scripts\\stop.bat        To diagnose: scripts\\doctor.bat")
    print("", flush=True)
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    host, port = args.host or bridge_host(), args.port or bridge_port()
    pid = recorded_pid()
    if pid:
        say(f"stopping bridge (pid {pid}) ...", INFO)
        kill_pid(pid)
        PID_FILE.unlink(missing_ok=True)
    else:
        say("no running bridge was recorded", INFO)

    deadline = time.time() + 10
    while port_open(host, port) and time.time() < deadline:
        time.sleep(0.3)
    if port_open(host, port):
        holder = _pid_on_port(port)
        if holder:
            say(f"port {port} still held by pid {holder}; stopping it", INFO)
            kill_pid(holder)
            time.sleep(1.5)
    if port_open(host, port):
        die(f"port {port} is still in use; stop that program manually.")
    say(f"port {port} is free", OK)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    host, port = args.host or bridge_host(), args.port or bridge_port()
    payload = {
        "project": str(ROOT),
        "venv": str(VENV),
        "venv_ready": VENV_PY.exists(),
        "token_present": TOKEN_FILE.exists(),
        "pid_file": str(PID_FILE),
        "pid_running": recorded_pid() is not None,
        "host": host,
        "port": port,
        "port_open": port_open(host, port),
        "config": str(config_path()),
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(SCRIPTS))
    import doctor  # noqa: PLC0415

    argv: list[str] = []
    if args.port:
        argv += ["--port", str(args.port)]
    if not args.shallow:
        argv.append("--deep")
    return doctor.main(argv)


def cmd_selftest(args: argparse.Namespace) -> int:
    venv_python = python_for_venv()
    install_deps(venv_python)
    return subprocess.run(
        [str(venv_python), str(SCRIPTS / "windows_selftest.py")], cwd=str(ROOT), check=False
    ).returncode


def cmd_estop(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(ROOT))
    from jarvis_core.emergency_stop import EmergencyStop  # noqa: PLC0415

    stop = EmergencyStop(STATE_DIR / "emergency_stop.json")
    if args.reset:
        stop.reset(authorized_by="launcher")
        say("EMERGENCY STOP reset - tool execution is allowed again.", OK)
        return 0
    stop.activate(reason="launcher")
    say("EMERGENCY STOP activated - every tool call is now refused.", OK)
    say("The bridge keeps running; reset with: scripts\\kill.bat --reset")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Arena PC Control launcher (setup, start, verify, stop)."
    )
    sub = parser.add_subparsers(dest="command")

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--host", default=None, help="override bridge host")
        p.add_argument("--port", type=int, default=None, help="override bridge port")

    start = sub.add_parser("start", help="install deps, start the bridge, verify it")
    add_common(start)
    start.add_argument("--timeout", type=float, default=45.0,
                       help="seconds to wait for the port (default 45)")
    start.set_defaults(func=cmd_start)

    stop = sub.add_parser("stop", help="stop the bridge and free the port")
    add_common(stop)
    stop.set_defaults(func=cmd_stop)

    status = sub.add_parser("status", help="print launcher/bridge state as JSON")
    add_common(status)
    status.set_defaults(func=cmd_status)

    doctor_cmd = sub.add_parser("doctor", help="diagnose the whole chain")
    doctor_cmd.add_argument("--port", type=int, default=None)
    doctor_cmd.add_argument("--shallow", action="store_true", help="skip deep checks")
    doctor_cmd.set_defaults(func=cmd_doctor)

    selftest = sub.add_parser("selftest", help="run the live tool self-test")
    selftest.set_defaults(func=cmd_selftest)

    estop = sub.add_parser("kill", help="activate or reset the emergency stop")
    estop.add_argument("--reset", action="store_true")
    estop.set_defaults(func=cmd_estop)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        args = parser.parse_args(["start"])
    handed_off = reexec_in_venv_if_needed(args.command)
    if handed_off is not None:
        return handed_off
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        warn("cancelled by user")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
