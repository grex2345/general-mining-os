#!/usr/bin/env python3
"""Windows launcher helper — everything the .bat files must not do inline.

CMD quoting is fragile: a multi-line `python -c`, a `>` inside a quoted
argument or a missing `^` escape silently breaks the launcher. The batch files
therefore only call this script with plain arguments:

    python scripts/bootstrap.py token      # create/print the pairing token
    python scripts/bootstrap.py wait 18765 # wait for the port to accept TCP
    python scripts/bootstrap.py selfcheck  # bridge is up *and* authenticating

Each sub-command is idempotent and exits non-zero with a readable message.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = Path.home() / ".arena-pc-control"
TOKEN_FILE = STATE_DIR / "auth_token.txt"


def cmd_token(_: argparse.Namespace) -> int:
    """Ensure a pairing token exists, then print only the token."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    token = ""
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    if not token:
        token = secrets.token_urlsafe(32)
        TOKEN_FILE.write_text(token + "\n", encoding="utf-8")
    if os.name == "posix":
        try:
            TOKEN_FILE.chmod(0o600)
        except OSError:
            pass
    print(token)
    return 0


def cmd_wait(args: argparse.Namespace) -> int:
    """Wait until something accepts TCP connections on host:port."""
    deadline = time.time() + float(args.timeout)
    while time.time() < deadline:
        try:
            with socket.create_connection((args.host, args.port), timeout=1.0):
                return 0
        except OSError:
            time.sleep(0.4)
    print(
        f"ERROR: nothing is listening on {args.host}:{args.port} "
        f"after {args.timeout:g}s.",
        file=sys.stderr,
    )
    return 1


def cmd_selfcheck(args: argparse.Namespace) -> int:
    """Full readiness check: TCP, WebSocket upgrade, token auth, tool catalog.

    Delegates to verify_bridge.py so there is exactly one definition of "ready".
    """
    if str(ROOT / "scripts") not in sys.path:
        sys.path.insert(0, str(ROOT / "scripts"))
    import verify_bridge  # noqa: PLC0415  (local import keeps --help fast)

    ok, _ = verify_bridge.run_verification(
        host=args.host, port=args.port, timeout=args.timeout, echo=True
    )
    return 0 if ok else 1


def cmd_launch(args: argparse.Namespace) -> int:
    """Start the bridge detached, with logs redirected, and record its PID.

    Doing this in Python avoids the CMD quoting trap of
    `start "" /min cmd /c ""...\python.exe" -u ... > log 2> log"`.
    """
    import subprocess  # noqa: PLC0415

    log_dir = ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = log_dir / "bridge.stdout.log"
    stderr_path = log_dir / "bridge.stderr.log"

    cmd = [
        sys.executable,
        "-u",
        str(ROOT / "bridge" / "server.py"),
        "--config",
        str(Path(args.config).resolve()),
    ]
    if args.port:
        cmd += ["--port", str(args.port)]

    creationflags = 0
    if os.name == "nt":
        # Detach from this console so closing the launcher does not kill it.
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
            start_new_session=(os.name != "nt"),
        )

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    (STATE_DIR / "bridge.pid").write_text(str(proc.pid), encoding="utf-8")
    print(proc.pid)
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    """Stop the bridge recorded in the pid file (and free the port)."""
    import signal  # noqa: PLC0415

    pid_file = STATE_DIR / "bridge.pid"
    stopped = False
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            pid = 0
        if pid:
            try:
                os.kill(pid, signal.SIGTERM)
                stopped = True
                print(f"Stopped bridge process {pid}.")
            except OSError:
                print(f"Bridge process {pid} is not running.")
        pid_file.unlink(missing_ok=True)
    if not stopped:
        print("No running bridge was recorded.")
    if not args.port:
        return 0
    # SIGTERM is asynchronous: give the bridge a moment to close its socket
    # before declaring the port busy (avoids a false "still in use").
    for _ in range(40):
        try:
            with socket.create_connection(("127.0.0.1", args.port), timeout=0.5):
                time.sleep(0.25)
        except OSError:
            print(f"Port {args.port} is free.")
            return 0
    # Fall back to whatever still holds the port (e.g. a bridge started by hand).
    if os.name == "nt":
        import subprocess  # noqa: PLC0415

        out = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True, check=False
        ).stdout
        for line in out.splitlines():
            if f":{args.port}" in line and "LISTENING" in line.upper():
                holder = line.split()[-1]
                if holder.isdigit():
                    subprocess.run(
                        ["taskkill", "/F", "/PID", holder], capture_output=True, check=False
                    )
                    print(f"Freed port {args.port} (killed pid {holder}).")
    print(f"Port {args.port} is still in use; stop the bridge manually.")
    return 1


def cmd_status(args: argparse.Namespace) -> int:
    """Machine-readable snapshot, used by scripts/doctor.py and troubleshooting."""
    token = TOKEN_FILE.read_text(encoding="utf-8").strip() if TOKEN_FILE.exists() else ""
    payload = {
        "state_dir": str(STATE_DIR),
        "token_present": bool(token),
        "token_length": len(token),
        "pid_file": str(STATE_DIR / "bridge.pid"),
        "pid_running": False,
        "port_open": False,
    }
    pid_file = STATE_DIR / "bridge.pid"
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            pid = 0
        if pid:
            try:
                os.kill(pid, 0)
                payload["pid_running"] = True
            except OSError:
                payload["pid_running"] = False
    try:
        with socket.create_connection((args.host, args.port), timeout=1.0):
            payload["port_open"] = True
    except OSError:
        payload["port_open"] = False
    print(json.dumps(payload, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Arena PC Control launcher helper")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("token", help="create/print the pairing token").set_defaults(func=cmd_token)

    wait = sub.add_parser("wait", help="wait for a TCP port to open")
    wait.add_argument("port", type=int)
    wait.add_argument("--host", default="127.0.0.1")
    wait.add_argument("--timeout", type=float, default=30.0)
    wait.set_defaults(func=cmd_wait)

    check = sub.add_parser("selfcheck", help="verify the bridge end to end")
    check.add_argument("--port", type=int, default=18765)
    check.add_argument("--host", default="127.0.0.1")
    check.add_argument("--timeout", type=float, default=12.0)
    check.set_defaults(func=cmd_selfcheck)

    launch = sub.add_parser("launch", help="start the bridge detached with logs")
    launch.add_argument("--config", default=str(ROOT / "config.default.json"))
    launch.add_argument("--port", type=int, default=0)
    launch.set_defaults(func=cmd_launch)

    stop = sub.add_parser("stop", help="stop the bridge from the pid file")
    stop.add_argument("--port", type=int, default=0)
    stop.set_defaults(func=cmd_stop)

    status = sub.add_parser("status", help="print bridge/token status as JSON")
    status.add_argument("--port", type=int, default=18765)
    status.add_argument("--host", default="127.0.0.1")
    status.set_defaults(func=cmd_status)

    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
