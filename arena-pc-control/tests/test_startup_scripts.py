#!/usr/bin/env python3
"""Static validation tests for the Windows startup scripts.

These tests run on Linux and validate the *contents* of the .bat files
so that the same classes of CMD errors reported by the user cannot
regress. They do NOT execute the .bat files (Windows-only).
"""

from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _bat(name: str) -> str:
    return (ROOT / "scripts" / name).read_text(encoding="utf-8")


def test_start_bat_has_no_git_merge_markers() -> None:
    """start.bat must not contain unresolved Git conflict markers."""
    text = _bat("start.bat")
    # Conflict markers appear at line starts with specific patterns
    for line in text.splitlines():
        assert not line.startswith("<<<<<<< "), (
            f"start.bat contains merge marker: {line!r}"
        )
        assert not line.startswith(">>>>>>> "), (
            f"start.bat contains merge marker: {line!r}"
        )
        # ======= alone on a line is a conflict separator; ====... in echoes is fine
        assert line.strip() != "=======", (
            f"start.bat contains conflict separator line: {line!r}"
        )


def test_start_bat_has_no_multiline_python_c() -> None:
    """No Python code may be passed inline via `python -c \"...\"` with
    embedded newlines — CMD would interpret it as separate commands."""
    text = _bat("start.bat")
    # Find any `python -c` invocation
    for match in re.finditer(r'python\s+-c\s+"([^"]*)"', text):
        snippet = match.group(1)
        assert "\n" not in snippet, (
            "Inline python -c contains newlines — CMD will split it into commands"
        )


def test_start_bat_uses_verify_bridge_py() -> None:
    """Bridge readiness must be verified by verify_bridge.py, not by an
    inline HTTP check to a non-existent endpoint."""
    text = _bat("start.bat")
    assert "verify_bridge.py" in text, (
        "start.bat must invoke scripts/verify_bridge.py for port verification"
    )
    assert "urlopen" not in text, (
        "start.bat must not use urllib urlopen (Bridge is WebSocket-only, not HTTP)"
    )


def test_start_bat_has_system_ready_only_after_verification() -> None:
    """SYSTEM READY must only appear after the verify step (exit /b 1 on
    failure)."""
    text = _bat("start.bat")
    # Find the position of SYSTEM READY and verify step
    verify_idx = text.find("Verifying Bridge is listening")
    ready_idx = text.find("SYSTEM READY")
    assert verify_idx != -1, "start.bat must have a bridge verification step"
    assert ready_idx != -1, "start.bat must have SYSTEM READY"
    assert verify_idx < ready_idx, (
        "SYSTEM READY must come after bridge verification"
    )
    # There must be an error exit between verify and SYSTEM READY
    segment = text[verify_idx:ready_idx]
    assert "exit /b 1" in segment, (
        "start.bat must exit with error code if verification fails, before SYSTEM READY"
    )


def test_start_windows_bat_exists() -> None:
    """start_windows.bat must exist (referenced by extension popup)."""
    assert (ROOT / "scripts" / "start_windows.bat").exists(), (
        "scripts/start_windows.bat is missing — popup.html and popup.js reference it"
    )


def test_start_windows_bat_delegates_to_start_bat() -> None:
    """start_windows.bat must call start.bat, not duplicate its logic."""
    text = _bat("start_windows.bat")
    assert "start.bat" in text, (
        "start_windows.bat must delegate to start.bat"
    )
    assert "call" in text, (
        "start_windows.bat must use `call` to invoke start.bat"
    )


def test_verify_bridge_py_exists_and_is_python() -> None:
    """scripts/verify_bridge.py must exist and be valid Python."""
    path = ROOT / "scripts" / "verify_bridge.py"
    assert path.exists(), "scripts/verify_bridge.py is missing"
    content = path.read_text(encoding="utf-8")
    assert "import socket" in content, "verify_bridge.py must use socket for port check"
    assert "sys.exit(main())" in content or "raise SystemExit" in content, (
        "verify_bridge.py must return proper exit code"
    )


def test_jarvis_core_has_no_ai_brain_imports() -> None:
    """jarvis_core must not import from removed MODE A AI-brain modules."""
    forbidden_modules = [
        "model_provider",
        "api_server",
        "agent_loop",
        "planner",
        "reasoning",
        "task_engine",
        "cli",
    ]

    for py_file in ["jarvis_core/__init__.py", "jarvis_core/orchestrator.py"]:
        text = (ROOT / py_file).read_text(encoding="utf-8")
        for mod in forbidden_modules:
            # Match actual import statements: `import X`, `from X`, `from .X`
            patterns = [
                f"import {mod}",
                f"from {mod} ",
                f"from .{mod} ",
                f"from ..{mod} ",
            ]
            for pat in patterns:
                assert pat not in text, (
                    f"{py_file} must not import {mod} (MODE A removed): found {pat!r}"
                )


def test_manifest_has_no_ws_scheme() -> None:
    """Manifest V3 host_permissions must not include ws:// scheme (invalid)."""
    text = (ROOT / "extension" / "manifest.json").read_text(encoding="utf-8")
    assert "ws://" not in text, (
        "manifest.json host_permissions must not contain ws:// (MV3 invalid scheme)"
    )


def test_bridge_server_stop_has_no_dead_loop() -> None:
    """bridge/server.py stop() must not contain the dead `list_sessions() and []` loop."""
    text = (ROOT / "bridge" / "server.py").read_text(encoding="utf-8")
    assert "list_sessions() and []" not in text, (
        "bridge/server.py stop() must not contain dead list_sessions() and [] loop"
    )


def test_requirements_has_no_httpx_or_aiohttp() -> None:
    """requirements.txt must not include httpx or aiohttp (removed AI deps)."""
    text = (ROOT / "requirements.txt").read_text(encoding="utf-8")
    assert "httpx" not in text, "requirements.txt must not contain httpx"
    assert "aiohttp" not in text, "requirements.txt must not contain aiohttp"


# ── Extension integration tests ─────────────────────────────────────────


def _js(name: str) -> str:
    return (ROOT / "extension" / name).read_text(encoding="utf-8")


def test_arena_adapter_imports_arena_direct() -> None:
    """arena_adapter.js must import ArenaDirectAdapter from the separate module."""
    text = _js("arena_adapter.js")
    assert "import(" in text, "arena_adapter.js must use dynamic import()"
    assert "arena_direct.js" in text, "arena_adapter.js must reference arena_direct.js"
    assert "ArenaDirectAdapter" in text, (
        "arena_adapter.js must reference ArenaDirectAdapter class"
    )


def test_background_routes_approvals_to_owning_tab() -> None:
    """background.js must route approval_required only to the owning tab."""
    text = _js("background.js")
    assert "sendToTabForSession" in text, (
        "background.js must have sendToTabForSession function for targeted approval routing"
    )
    assert "tabSessionMap" in text, (
        "background.js must have tabSessionMap for tab-to-session routing"
    )
    assert "sessionTabMap" in text, (
        "background.js must have sessionTabMap for session-to-tab routing"
    )
    assert "pendingFrameTabs" in text, (
        "background.js must have pendingFrameTabs for frame-to-tab correlation"
    )


def test_background_does_not_broadcast_approvals() -> None:
    """background.js must NOT broadcast approval_required to all tabs."""
    text = _js("background.js")
    approval_section = text[
        text.find('msg.type === "approval_required"') : text.find('msg.type === "approval_required"') + 500
    ]
    assert "sendToTabForSession" in approval_section, (
        "approval_required must be routed via sendToTabForSession (targeted), not bare broadcast"
    )


def test_arena_direct_exports_class() -> None:
    """arena_direct.js must export ArenaDirectAdapter class."""
    text = _js("providers/arena_direct.js")
    assert "export { ArenaDirectAdapter }" in text, (
        "arena_direct.js must export ArenaDirectAdapter"
    )
    assert "class ArenaDirectAdapter" in text, (
        "arena_direct.js must define ArenaDirectAdapter class"
    )


def test_base_adapter_exports_class() -> None:
    """base_adapter.js must export BaseProviderAdapter class."""
    text = _js("providers/base_adapter.js")
    assert "export class BaseProviderAdapter" in text, (
        "base_adapter.js must export BaseProviderAdapter class"
    )


def test_manifest_has_content_scripts() -> None:
    """manifest.json must register content scripts for arena.ai."""
    text = (ROOT / "extension" / "manifest.json").read_text(encoding="utf-8")
    assert "arena.ai" in text, "manifest.json must match arena.ai URLs"
    assert "protocol.js" in text, "manifest.json must load protocol.js"
    assert "arena_adapter.js" in text, "manifest.json must load arena_adapter.js"


def test_no_removed_mode_a_files_exist() -> None:
    """All MODE A AI-brain files must be deleted."""
    forbidden_files = [
        "jarvis_core/model_provider.py",
        "jarvis_core/api_server.py",
        "jarvis_core/agent_loop.py",
        "jarvis_core/cli.py",
        "jarvis_core/planner.py",
        "jarvis_core/reasoning.py",
        "jarvis_core/task_engine.py",
    ]
    for rel in forbidden_files:
        assert not (ROOT / rel).exists(), f"{rel} must be deleted (MODE A removed)"


if __name__ == "__main__":
    # Allow running directly for quick feedback
    import traceback

    tests = [
        v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
            passed += 1
        except Exception as exc:
            print(f"FAIL  {t.__name__}: {exc}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
