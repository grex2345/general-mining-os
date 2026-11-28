"""Static + behavioural tests for the Windows launchers.

These exist because the project shipped a launcher that failed on a real Windows
machine with:

    'rena' is not recognized as an internal or external command
    'This' is not recognized
    'itle' is not recognized
    Bridge startup failed (exit code 1)

Root cause (verified): the `.bat` files were UTF-8 with an em dash, were stored
with LF-only line endings, and ran `chcp 65001`. CMD's batch parser reads the
file byte-by-byte through the console code page and expects CRLF; with LF-only
files and multi-byte characters it desynchronises and starts executing fragments
of *comment* text as commands ("Arena", "title", ...).

The fix removed the logic from CMD entirely: every `.bat` is now an ASCII-only,
CRLF, `goto`-based stub that only locates Python and calls `launcher.py`. These
tests pin all of those invariants plus the launcher's real behaviour.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parent.parent
BAT_FILES = sorted(ROOT.glob("*.bat")) + sorted((ROOT / "scripts").glob("*.bat"))


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ── 1. The bug that broke the user's machine ─────────────────────────────
@pytest.mark.parametrize("path", BAT_FILES, ids=lambda p: str(p.relative_to(ROOT)))
def test_bat_files_are_ascii_only(path: Path) -> None:
    """Non-ASCII text + `chcp 65001` desynchronises the CMD parser.

    That is what turned comments into commands ('rena' is not recognized ...).
    """
    raw = path.read_bytes()
    offenders = [(i, line) for i, line in enumerate(raw.decode("latin-1").splitlines(), 1)
                 if any(ord(ch) > 127 for ch in line)]
    assert not offenders, (
        f"{path.name} contains non-ASCII characters on line(s) "
        f"{[n for n, _ in offenders]}: {offenders[:2]}. CMD will mis-parse them."
    )


@pytest.mark.parametrize("path", BAT_FILES, ids=lambda p: str(p.relative_to(ROOT)))
def test_bat_files_use_crlf_line_endings(path: Path) -> None:
    """LF-only batch files are merged line-by-line by CMD."""
    raw = path.read_bytes()
    assert b"\r\n" in raw, f"{path.name} has no CRLF line endings"
    bare_lf = raw.replace(b"\r\n", b"").count(b"\n")
    assert bare_lf == 0, f"{path.name} has {bare_lf} LF-only line ending(s); CMD requires CRLF"


@pytest.mark.parametrize("path", BAT_FILES, ids=lambda p: str(p.relative_to(ROOT)))
def test_bat_files_have_no_bom(path: Path) -> None:
    """A UTF-8 BOM makes CMD try to run '\\ufeff@echo' and fail immediately."""
    head = path.read_bytes()[:3]
    assert head != b"\xef\xbb\xbf", f"{path.name} starts with a UTF-8 BOM"


def test_gitattributes_forces_crlf_for_bat_files() -> None:
    """The corruption is reintroduced by any fresh checkout without this rule."""
    attrs = ROOT / ".gitattributes"
    assert attrs.exists(), ".gitattributes missing: bat files can be checked out as LF"
    text = _read(attrs)
    assert re.search(r"^\*\.bat\s+text\s+eol=crlf", text, re.M), (
        "*.bat must be pinned to CRLF in .gitattributes"
    )


# ── 2. No logic in CMD, no comment text that CMD can execute ─────────────
def test_entry_bat_only_locates_python_and_calls_the_launcher() -> None:
    text = _read(ROOT / "start_windows.bat")
    assert "launcher.py" in text and '" start' in text
    # `rem` comments are inert for CMD; `::` labels inside ( ) blocks are not.
    for line in text.splitlines():
        stripped = line.strip()
        assert not stripped.startswith("::"), (
            "use `rem` instead of `::` (breaks inside parenthesised blocks): "
            f"{line!r}"
        )


def test_entry_bat_has_no_logic_that_breaks_on_spaces_or_ampersands() -> None:
    """Path-sensitive constructs are forbidden: they fail on 'C:\\Tom & Jerry\\...'."""
    text = _read(ROOT / "start_windows.bat")
    forbidden = {
        "python -c": "inline python breaks on multi-line and quoting",
        "pushd %~dp0": "use `cd /d \"%~dp0\"` (quoted)",
        "%ROOT_DIR%": "no custom path variables: values may contain ) or &",
        "for /f": "FOR loops re-parse their body and mangle special characters",
        "chcp": "a code-page switch is only needed for non-ASCII files",
        "set /p": "reading a token via SET /P truncates it",
    }
    for token, why in forbidden.items():
        assert token not in text, f"{token!r} must not appear in the entry bat ({why})"


def test_every_bat_delegates_to_the_shared_launcher() -> None:
    """One startup implementation; the .bat files are thin stubs."""
    for path in BAT_FILES:
        text = _read(path)
        assert "launcher.py" in text, f"{path.name} must call launcher.py"
        assert len(text.splitlines()) <= 40, (
            f"{path.name} has grown logic back into CMD ({len(text.splitlines())} lines)"
        )


def test_launcher_dispatch_targets_are_all_present() -> None:
    launcher = _read(ROOT / "launcher.py")
    for command in ("start", "stop", "status", "doctor", "selftest", "kill"):
        assert f'"{command}"' in launcher or f"'{command}'" in launcher
    for bat, sub in (
        ("start_windows.bat", "start"),
        ("kill.bat", "kill"),
        ("scripts/stop.bat", "stop"),
        ("scripts/doctor.bat", "doctor"),
        ("scripts/selftest.bat", "selftest"),
    ):
        assert f'launcher.py" {sub}' in _read(ROOT / bat), f"{bat} must dispatch '{sub}'"


# ── 3. The stub must survive CMD parsing (modelled) ──────────────────────
def _simulate_cmd(raw: bytes) -> list[str]:
    """Model of CMD's batch reader, deliberately strict about line endings.

    CMD's batch parser reads the file through the console code page and only
    treats CRLF as a line terminator. A LF-only file therefore does not split
    into the lines the author wrote: the parser resumes mid-token and executes
    fragments of comment text. Reproducing that here is what pins the bug.
    """
    text = raw.decode("ascii", "replace")
    if "\n" in text.replace("\r\n", ""):
        # LF without CR: CMD does not see a new command here.
        raise AssertionError("file contains LF-only line endings; CMD will not split there")
    return text.split("\r\n")


def test_stub_parses_into_expected_commands() -> None:
    """Every parsed line must be a complete, recognisable CMD command."""
    lines = _simulate_cmd((ROOT / "start_windows.bat").read_bytes())
    assert lines[0].strip().lower() == "@echo off"
    allowed = {
        "echo", "setlocal", "cd", "if", "where", "goto", "set", "pause", "exit",
        "rem", "%apc_py%", "call", ":run", "endlocal",
    }
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        token = line.split()[0].lstrip("@").lower().rstrip(".")  # `echo.` prints a blank line
        assert token in allowed, f"unexpected command token {token!r} in {line!r}"
        # `>nul 2>nul` silences output; anything else redirection-ish is a risk.
        redirects = re.findall(r"(?:\d?>)", line)
        assert len(redirects) <= 2, f"too many redirections in {line!r}"


def test_stub_has_no_blocks_or_pipes_that_break_on_odd_paths() -> None:
    """`( )` blocks, `&`, `|`, `<`, `>` are rejected outside quotes and echoes.

    `%VAR%` inside a parenthesised block is expanded before the block is parsed,
    so a path containing `)` or `&` terminates it early. The stubs therefore use
    `if ... goto` only.
    """
    text = _read(ROOT / "start_windows.bat")
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.lower().startswith(("rem", "echo")):
            continue
        if stripped.startswith(":") or stripped.lower() == "setlocal":
            continue
        unquoted = re.sub(r'"[^"]*"', "", stripped)
        # `>nul 2>nul` is the only accepted redirection (it cannot fork a line).
        unquoted = unquoted.replace(">nul", "").replace("2>", "")
        for char in ("&", "|", "<", ">"):
            assert char not in unquoted, f"unquoted {char!r} in {line!r}"
        assert "(" not in unquoted, f"parenthesised block in {line!r} (fragile with %VAR%)"


# ── 4. Launcher behaviour (runs for real on this OS) ─────────────────────
def _launcher(*args: str, cwd: Path | None = None, env_home: Path | None = None,
              timeout: int = 240) -> subprocess.CompletedProcess:
    import os

    env = dict(os.environ)
    if env_home is not None:
        env["HOME"] = str(env_home)
        env["USERPROFILE"] = str(env_home)
    return subprocess.run(
        [sys.executable, str(ROOT / "launcher.py"), *args],
        cwd=str(cwd or ROOT),
        capture_output=True,
        text=True,
        env=env,
        timeout=timeout,
        check=False,
    )


def test_launcher_help_lists_all_commands() -> None:
    result = _launcher("--help")
    assert result.returncode == 0, result.stderr
    for command in ("start", "stop", "status", "doctor", "selftest", "kill"):
        assert command in result.stdout


def test_launcher_status_works_before_any_install(tmp_path: Path) -> None:
    result = _launcher("status", "--port", "1", env_home=tmp_path)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["port_open"] is False
    assert payload["token_present"] is False


def test_launcher_reports_broken_config_instead_of_a_traceback(tmp_path: Path) -> None:
    """A missing comma in config must not print a JSONDecodeError stack."""
    project = tmp_path / "proj"
    (project / "scripts").mkdir(parents=True)
    (project / "bridge").mkdir()
    (project / "launcher.py").write_bytes((ROOT / "launcher.py").read_bytes())
    (project / "requirements.txt").write_bytes((ROOT / "requirements.txt").read_bytes())
    (project / "config.default.json").write_text('{ "bridge": { "port": 1 }\n  "x": 1 }')
    result = subprocess.run(
        [sys.executable, str(project / "launcher.py"), "start"],
        cwd=str(project), capture_output=True, text=True, timeout=120, check=False,
    )
    output = result.stdout + result.stderr
    assert result.returncode != 0
    assert "not valid JSON" in output, output
    assert "Traceback" not in output, "a config typo must not dump a stack trace"
    assert "line 2" in output.lower() or "line 1" in output.lower()


def test_launcher_detects_it_must_switch_to_the_venv() -> None:
    """Regression: sys.executable vs .venv/bin/python compares equal through a
    symlink, which skipped the handoff and made verification report
    'websockets library is not installed' right after installing it."""
    source = _read(ROOT / "launcher.py")
    assert "def inside_venv" in source
    assert "sys.prefix" in source, "venv detection must use sys.prefix, not sys.executable"
    assert "Path(sys.executable).resolve() == VENV_PY.resolve()" not in source, (
        "symlinked venv interpreters make this comparison always true"
    )


def test_console_output_is_ascii_safe() -> None:
    """A cp1252 console raises UnicodeEncodeError on '—' and aborts the run."""
    source = _read(ROOT / "launcher.py")
    for line in source.splitlines():
        if line.lstrip().startswith(("say(", "warn(", "die(")):
            assert all(ord(ch) < 128 for ch in line), f"non-ASCII console output: {line!r}"
    assert 'encode("ascii", "replace")' in source, "stdout must degrade safely"


# ── 5. Documentation must not contain executable CMD ─────────────────────
def test_docs_do_not_ship_a_broken_start_bat_snippet() -> None:
    """README/doc snippets are copy-pasted by users; they must be valid CMD."""
    for name in ("README.md", "docs/ARCHITECTURE_AND_ROADMAP.md"):
        text = _read(ROOT / name)
        for line in text.splitlines():
            if line.startswith("start ") or "start_windows.bat" in line and line.startswith("::"):
                assert False, f"{name} contains a raw CMD 'start' snippet: {line!r}"
    readme = _read(ROOT / "README.md")
    assert "start_windows.bat" in readme
    assert "launcher.py" in readme or "doctor" in readme
