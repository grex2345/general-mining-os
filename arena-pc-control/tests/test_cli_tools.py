"""Tests for the user-facing helper CLIs (bootstrap.py, doctor.py).

These are the commands a non-expert runs when something is broken, so a crash or
a misleading message here is a real defect.
"""

from __future__ import annotations

import json
from pathlib import Path
import socket
import subprocess
import sys
import time

import pytest

ROOT = Path(__file__).resolve().parent.parent
BOOTSTRAP = ROOT / "scripts" / "bootstrap.py"
DOCTOR = ROOT / "scripts" / "doctor.py"


def _run(*args: str, env_home: Path | None = None, timeout: int = 120):
    import os

    env = dict(os.environ)
    if env_home is not None:
        env["HOME"] = str(env_home)
        env["USERPROFILE"] = str(env_home)
    return subprocess.run(
        [sys.executable, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
        cwd=str(ROOT),
        check=False,
    )


def test_bootstrap_token_is_idempotent_and_private(tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir()
    first = _run(str(BOOTSTRAP), "token", env_home=home)
    assert first.returncode == 0, first.stderr
    token = first.stdout.strip()
    assert len(token) >= 32

    second = _run(str(BOOTSTRAP), "token", env_home=home)
    assert second.stdout.strip() == token, "token must be reused, not rotated on every launch"

    token_file = home / ".arena-pc-control" / "auth_token.txt"
    assert token_file.read_text(encoding="utf-8").strip() == token
    if sys.platform != "win32":
        assert (token_file.stat().st_mode & 0o077) == 0, "token file must not be world readable"


def test_bootstrap_wait_times_out_with_a_clear_message(tmp_path: Path) -> None:
    # Find a port that is definitely closed.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    result = _run(str(BOOTSTRAP), "wait", str(port), "--timeout", "1")
    assert result.returncode == 1
    assert "nothing is listening" in result.stderr


def test_bootstrap_wait_returns_when_the_port_opens(tmp_path: Path) -> None:
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen(1)
        port = server.getsockname()[1]
        result = _run(str(BOOTSTRAP), "wait", str(port), "--timeout", "5")
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("flag", ["--help"])
def test_bootstrap_and_doctor_have_help(flag: str) -> None:
    for script in (BOOTSTRAP, DOCTOR):
        result = _run(str(script), flag)
        assert result.returncode == 0
        assert "usage" in result.stdout.lower()


def test_bootstrap_status_is_valid_json(tmp_path: Path) -> None:
    result = _run(str(BOOTSTRAP), "status", "--port", "1", env_home=tmp_path)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["token_present"] is False
    assert payload["port_open"] is False


def test_doctor_reports_blockers_without_crashing(tmp_path: Path) -> None:
    """A fresh machine (no token, no bridge) must produce FAIL lines + a fix."""
    result = _run(str(DOCTOR), env_home=tmp_path, timeout=180)
    output = result.stdout
    assert result.returncode == 1, output
    assert "[FAIL] pairing token" in output
    assert "start_windows.bat" in output, "doctor must print the exact remedy"
    assert "RESULT:" in output


def test_doctor_passes_against_a_live_bridge(tmp_path: Path) -> None:
    """The full chain must be reported healthy when everything really is up."""
    home = tmp_path / "home"
    home.mkdir()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    assert _run(str(BOOTSTRAP), "token", env_home=home).returncode == 0
    launch = _run(
        str(BOOTSTRAP), "launch", "--port", str(port),
        "--config", str(ROOT / "config.default.json"), env_home=home,
    )
    assert launch.returncode == 0, launch.stderr
    try:
        assert _run(str(BOOTSTRAP), "wait", str(port), "--timeout", "30", env_home=home).returncode == 0
        result = _run(str(DOCTOR), "--deep", "--port", str(port), env_home=home, timeout=240)
        output = result.stdout
        assert "[PASS] bridge handshake" in output, output
        assert "[PASS] MCP server" in output, output
        assert "no blocking problems" in output or "in place" in output, output
        assert result.returncode == 0
    finally:
        _run(str(BOOTSTRAP), "stop", "--port", str(port), env_home=home)
        time.sleep(0.5)


# ── Windows typing path ───────────────────────────────────────────────────
def test_keyboard_text_is_passed_as_base64_unicode_not_sendkeys() -> None:
    """SendKeys cannot type Arabic or literal ^ % + { } — the tool must use
    SendInput with KEYEVENTF_UNICODE and transport text as base64."""
    import base64 as b64
    import sys as _sys

    _sys.path.insert(0, str(ROOT))
    from bridge.builtin_mcp_server import _type_text_script  # noqa: PLC0415

    sample = 'مرحبا "quoted" ^%+ (x) {ENTER} 100% ✅\nnext line'
    script = _type_text_script(sample)

    assert "SendInput" in script, "must type via SendInput, not WScript.Shell.SendKeys"
    assert "dwFlags = 4" in script, "KEYEVENTF_UNICODE (0x0004) is what makes Arabic work"
    assert "SendKeys" not in script
    encoded = b64.b64encode(sample.encode("utf-8")).decode("ascii")
    assert encoded in script, "text must ride along as base64 (no quoting/code-page damage)"
    # Nothing outside ASCII may leak into the script itself.
    script.encode("ascii")  # raises UnicodeEncodeError if raw text slipped in
    assert "Convert]::FromBase64String" in script
