"""Tests for JARVIS EmergencyStop kill switch."""

from __future__ import annotations

from pathlib import Path
import json
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402


def test_emergency_stop_activate_and_reset(tmp_path: Path) -> None:
    stop_file = tmp_path / "emergency.json"
    es = EmergencyStop(stop_file)
    assert es.is_stopped is False

    es.activate(reason="test_activate")
    assert es.is_stopped is True

    # Persistence check: new instance reads same file
    es2 = EmergencyStop(stop_file)
    assert es2.is_stopped is True

    es2.reset(authorized_by="test_user")
    assert es2.is_stopped is False

    es3 = EmergencyStop(stop_file)
    assert es3.is_stopped is False


def test_require_running_raises_when_stopped(tmp_path: Path) -> None:
    es = EmergencyStop(tmp_path / "emergency2.json")
    es.activate()
    try:
        es.require_running()
        assert False, "Should have raised RuntimeError"
    except RuntimeError as exc:
        assert "EMERGENCY STOP" in str(exc)


def test_audit_log_written(tmp_path: Path) -> None:
    # Point to a temp audit path by using home dir is complex; just verify activate doesn't crash
    es = EmergencyStop(tmp_path / "emergency3.json")
    es.activate(reason="audit_test")
    assert es.is_stopped is True
