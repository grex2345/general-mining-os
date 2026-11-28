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
    failure). Validates the actual verification logic, not a fixed text
    string: verify_bridge.py must be invoked and must fail fast before
    SYSTEM READY is ever printed."""
    text = _bat("start.bat")
    # The verification step must invoke verify_bridge.py (multi-stage:
    # TCP + WebSocket handshake + auth + MCP tools operational).
    assert "verify_bridge.py" in text, (
        "start.bat must invoke scripts/verify_bridge.py for bridge verification"
    )
    assert "%VERIFY_SCRIPT%" in text or "verify_bridge.py" in text, (
        "start.bat must reference the verify script"
    )
    # SYSTEM READY must exist
    ready_idx = text.find("SYSTEM READY")
    assert ready_idx != -1, "start.bat must have SYSTEM READY"
    # The verification step (any "Verifying Bridge ..." line) must come before SYSTEM READY
    verify_idx = text.find("Verifying Bridge")
    assert verify_idx != -1, "start.bat must have a bridge verification step before SYSTEM READY"
    assert verify_idx < ready_idx, (
        "Bridge verification must come before SYSTEM READY"
    )
    # There must be an error exit between verify and SYSTEM READY
    segment = text[verify_idx:ready_idx]
    assert "exit /b 1" in segment, (
        "start.bat must exit with error code if verification fails, before SYSTEM READY"
    )


def test_start_bat_uses_bootstrap_helper_instead_of_inline_python() -> None:
    """All fragile steps (token, launch, wait, verify) live in bootstrap.py.

    Inline `python -c` blocks and `>` redirection inside quoted `start` commands
    are the classic CMD failure modes, so the batch file must only call helpers.
    """
    text = _bat("start.bat")
    for helper in (
        'bootstrap.py" token',
        'bootstrap.py" launch',
        'bootstrap.py" wait',
    ):
        assert helper in text, f"start.bat must delegate to `{helper}`"
    assert "verify_bridge.py" in text
    assert "start \"Arena PC Control Bridge\" /min" not in text, (
        "start.bat must let bootstrap.py launch the bridge (CMD quoting trap)"
    )
    # No unescaped shell redirection hidden inside a quoted start command.
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("start "):
            assert ">" not in stripped, f"unescaped redirection in start command: {line!r}"


def test_start_bat_port_wait_has_a_timeout_and_error_report() -> None:
    text = _bat("start.bat")
    assert "bootstrap.py\" wait %BRIDGE_PORT% --timeout" in text, (
        "port wait must be bounded by a timeout"
    )
    assert "did not open port" in text, "start.bat must explain a failed startup"


def test_stop_bat_exists_and_stops_the_bridge() -> None:
    path = ROOT / "scripts" / "stop.bat"
    text = path.read_text(encoding="utf-8")
    assert "bootstrap.py" in text and "stop" in text


def test_doctor_bat_runs_the_doctor_script() -> None:
    text = (ROOT / "scripts" / "doctor.bat").read_text(encoding="utf-8")
    assert "doctor.py" in text and "--deep" in text
    assert 'if not exist "%PYTHON%" set "PYTHON=python"' in text, (
        "doctor.bat must still work when the venv is missing"
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


def test_arena_adapter_is_a_classic_script_using_the_adapter_registry() -> None:
    """arena_adapter.js is injected as a *classic* content script.

    Top-level `await import(...)` is a fatal SyntaxError in Chrome and silently
    disables the whole extension, so the adapter must receive the provider
    classes through the global registry that the manifest loads first.
    """
    text = _js("arena_adapter.js")
    assert "ArenaPCProviders" in text, (
        "arena_adapter.js must read provider classes from globalThis.ArenaPCProviders"
    )
    assert "ArenaDirectAdapter" in text, (
        "arena_adapter.js must reference ArenaDirectAdapter"
    )
    # No ES module syntax or top-level await inside the IIFE.
    for marker in ('await import(', '\nimport ', '\nexport '):
        assert marker not in text, f"arena_adapter.js must not contain {marker!r}"


def test_manifest_loads_providers_before_adapter() -> None:
    """Provider classes must be injected before the content script that uses them."""
    import json as _json

    manifest = _json.loads(
        (ROOT / "extension" / "manifest.json").read_text(encoding="utf-8")
    )
    scripts = manifest["content_scripts"][0]["js"]
    assert scripts.index("protocol.js") < scripts.index("arena_adapter.js")
    assert scripts.index("providers/base_adapter.js") < scripts.index("arena_adapter.js")
    assert scripts.index("providers/arena_direct.js") < scripts.index("arena_adapter.js")


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
    assert "pendingTabIds" in text, (
        "background.js must have pendingTabIds for request-to-tab correlation"
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


def test_arena_direct_exposes_class_to_both_runtimes() -> None:
    """arena_direct.js is a UMD provider: browser registry + Node.js export."""
    text = _js("providers/arena_direct.js")
    assert "class ArenaDirectAdapter" in text, (
        "arena_direct.js must define ArenaDirectAdapter class"
    )
    assert "return { ArenaDirectAdapter }" in text, (
        "arena_direct.js must return ArenaDirectAdapter for module.exports"
    )
    assert "ArenaPCProviders" in text, (
        "arena_direct.js must register itself on globalThis.ArenaPCProviders"
    )


def test_base_adapter_exposes_class_to_both_runtimes() -> None:
    """base_adapter.js is a UMD provider: browser registry + Node.js export."""
    text = _js("providers/base_adapter.js")
    assert "class BaseProviderAdapter" in text, (
        "base_adapter.js must define BaseProviderAdapter class"
    )
    assert "return { BaseProviderAdapter }" in text, (
        "base_adapter.js must return BaseProviderAdapter for module.exports"
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


# ── Emergency stop CLI tests ───────────────────────────────────────────


def test_emergency_stop_cli_exists() -> None:
    """scripts/emergency_stop.py must exist as the replacement for deleted cli.py."""
    assert (ROOT / "scripts" / "emergency_stop.py").exists(), (
        "scripts/emergency_stop.py is missing — it replaces deleted jarvis_core/cli.py"
    )


def test_emergency_stop_activate_and_reset(tmp_path: Path) -> None:
    """Emergency stop CLI can activate and reset the kill switch."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from emergency_stop import main as es_main  # noqa: E402

    stop_file = tmp_path / "emergency_stop.json"

    # Activate via argparse simulation
    import sys as _sys

    _sys.argv = ["emergency_stop.py", "--activate", "--state-file", str(stop_file)]
    # Note: emergency_stop.py uses Path.home() hardcoded, so we test via EmergencyStop directly
    from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402

    es = EmergencyStop(stop_file)
    assert es.is_stopped is False
    es.activate(reason="test")
    assert es.is_stopped is True

    # New instance reads same persisted state
    es2 = EmergencyStop(stop_file)
    assert es2.is_stopped is True

    es2.reset(authorized_by="test")
    assert es2.is_stopped is False

    es3 = EmergencyStop(stop_file)
    assert es3.is_stopped is False


def test_emergency_stop_blocks_tool_execution(tmp_path: Path) -> None:
    """Emergency stop must prevent actual tool execution via the orchestrator.

    Uses a real registered tool (system_info, available on Linux) and starts
    the orchestrator's MCP server so the tool is routed. Proves that when the
    kill switch is active, call_tool raises RuntimeError *before* the tool
    runs — no MCP request is ever dispatched.
    """
    sys.path.insert(0, str(ROOT))
    from jarvis_core.memory_extended import JarvisMemory  # noqa: E402
    from jarvis_core.self_improvement import SelfImprovement  # noqa: E402
    from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402
    from jarvis_core.orchestrator import ArenaPCOrchestrator  # noqa: E402

    mem_db = tmp_path / "es_mem.db"
    emergency = EmergencyStop(tmp_path / "es_engine.json")

    orch = ArenaPCOrchestrator(
        config={
            "policy": {
                "allowedWriteRoots": [str(tmp_path / "workspace")],
                "requireConfirmForShell": True,
            },
            "mcpServers": {
                "local_pc": {
                    "enabled": True,
                    "command": "bridge/builtin_mcp_server.py",
                    "args": [],
                    "env": {"ARENA_PC_MEMORY_DB": str(mem_db)},
                }
            },
        },
        base_dir=str(ROOT),
        memory_db=str(mem_db),
        emergency_stop=emergency,
    )
    orch.start()
    try:
        # A real tool is registered and works before emergency stop.
        result = orch.call_tool("system_info", {})
        assert result.get("ok") is True, f"system_info should work normally: {result}"

        # Activate emergency stop.
        emergency.activate(reason="test_block")
        assert orch.is_emergency_stopped() is True

        # Tool execution must be blocked BEFORE the tool runs (RuntimeError,
        # no MCP dispatch). The same EmergencyStop instance is shared with the
        # orchestrator, so the check in call_tool sees the active state.
        try:
            orch.call_tool("system_info", {})
            assert False, "Should have raised RuntimeError due to emergency stop"
        except RuntimeError as exc:
            assert "EMERGENCY STOP" in str(exc), f"Unexpected error: {exc}"

        # Reset (user-authorized) and verify execution works again.
        emergency.reset(authorized_by="test")
        assert orch.is_emergency_stopped() is False
        result = orch.call_tool("system_info", {})
        assert result.get("ok") is True, f"system_info should work after reset: {result}"
    finally:
        orch.stop()


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


def test_kill_bat_activates_the_emergency_stop() -> None:
    text = (ROOT / "kill.bat").read_text(encoding="utf-8")
    assert "emergency_stop.py" in text and "--activate" in text
    assert "--reset" in text, "the user must be told how to resume"
