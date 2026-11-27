"""Tests for JARVIS JarvisOrchestrator full autonomous flow."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.orchestrator import build_jarvis_from_config, JarvisOrchestrator  # noqa: E402


def _fresh_jarvis(tmp_path: Path) -> JarvisOrchestrator:
    """Build a JARVIS instance with emergency stop reset to avoid cross-test state leakage."""
    jarvis = build_jarvis_from_config()
    # Reset emergency stop (may have been activated by a previous test that persisted to disk)
    jarvis.emergency_reset(authorized_by="test_setup")
    return jarvis


def test_orchestrator_build_from_config(tmp_path: Path) -> None:
    jarvis = _fresh_jarvis(tmp_path)
    assert jarvis is not None
    assert jarvis.policy is not None
    assert jarvis.router is not None
    assert jarvis.memory is not None
    assert jarvis.improvement is not None
    assert jarvis.emergency is not None
    assert jarvis.is_emergency_stopped() is False


def test_orchestrator_execute_objective_system_info(tmp_path: Path) -> None:
    jarvis = _fresh_jarvis(tmp_path)
    try:
        jarvis.start()
        result = jarvis.execute_objective("Check my system information", project="test_proj")
        assert result["objective"] == "Check my system information"
        assert result["project"] == "test_proj"
        assert "result" in result
        assert "steps_completed" in result["result"]
        assert result["intent"]["type"] in ("system_admin", "unknown")
    finally:
        jarvis.stop()


def test_orchestrator_emergency_stop_blocks_execution(tmp_path: Path) -> None:
    jarvis = _fresh_jarvis(tmp_path)
    try:
        jarvis.start()
        jarvis.emergency_activate(reason="test_block")
        assert jarvis.is_emergency_stopped() is True
        try:
            jarvis.execute_objective("Do something while stopped")
            assert False, "Should have raised RuntimeError"
        except RuntimeError:
            pass
    finally:
        jarvis.emergency_reset(authorized_by="test")
        jarvis.stop()


def test_orchestrator_memory_preferences(tmp_path: Path) -> None:
    jarvis = _fresh_jarvis(tmp_path)
    try:
        jarvis.start()
        saved = jarvis.save_preference("test_key", "test_value")
        assert saved["ok"] is True
        recalled = jarvis.recall_preference("test_key")
        assert recalled == "test_value"
    finally:
        jarvis.stop()


def test_orchestrator_workflow_crud(tmp_path: Path) -> None:
    jarvis = _fresh_jarvis(tmp_path)
    try:
        jarvis.start()
        saved = jarvis.save_workflow(
            "test_wf",
            [{"tool": "system_info", "arguments": {}}],
            "A test workflow",
        )
        assert saved["ok"] is True
        wf = jarvis.list_workflows()
        assert len(wf) >= 1
        assert any(w.get("name") == "test_wf" for w in wf)
    finally:
        jarvis.stop()
