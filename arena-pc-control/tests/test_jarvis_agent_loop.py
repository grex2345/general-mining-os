"""Tests for JARVIS Agent Loop — the 12-step intelligent execution loop."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402

from jarvis_core.agent_loop import JarvisAgentLoop, AgentLoopResult, create_jarvis_agent  # noqa: E402
from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402


def test_create_jarvis_agent() -> None:
    agent = create_jarvis_agent(project="test_proj")
    assert agent is not None
    assert agent.session_id is not None
    assert agent.project == "test_proj"
    assert agent.policy is not None
    assert agent.memory is not None
    assert agent.emergency is not None


def test_agent_loop_status() -> None:
    agent = create_jarvis_agent(project="status_test")
    status = agent.get_status()
    assert "session_id" in status
    assert status["project"] == "status_test"
    assert "started" in status
    assert "emergency_stopped" in status


def test_agent_emergency_stop_blocks_loop(tmp_path: Path) -> None:
    agent = create_jarvis_agent(project="emergency_test")
    # Use a temp file so emergency stop state doesn't leak between tests
    agent.emergency = EmergencyStop(tmp_path / "emergency_test.json")
    agent.emergency.activate(reason="test")
    assert agent.emergency.is_stopped is True

    # run_objective is async — run via asyncio
    import asyncio

    try:
        asyncio.run(agent.run_objective("Do something while stopped"))
        assert False, "Should have raised RuntimeError"
    except RuntimeError as exc:
        assert "EMERGENCY STOP" in str(exc)

    agent.emergency.reset(authorized_by="test")


def test_agent_result_structure() -> None:
    """Verify AgentLoopResult has all required fields."""
    agent = create_jarvis_agent(project="struct_test")
    import inspect

    fields = [f.name for f in inspect.getattr_static(AgentLoopResult, "__dataclass_fields__").values()]
    required = [
        "objective", "project", "session_id", "success", "steps_completed",
        "total_steps", "summary", "errors", "execution_log", "completed_at",
    ]
    for field_name in required:
        assert field_name in fields, f"Missing field: {field_name}"


def test_agent_loop_with_start_stop(tmp_path: Path) -> None:
    agent = create_jarvis_agent(project="lifecycle_test")
    assert agent._started is False

    agent.start()
    assert agent._started is True
    assert len(agent.router.clients) >= 1  # local_pc server started

    agent.stop()
    assert agent._started is False


def test_agent_intent_analysis_in_loop() -> None:
    agent = create_jarvis_agent(project="intent_test")
    intent = agent.analyzer.analyze("Open YouTube and search for Python tutorials")
    assert intent.intent_type == "web_research"
    assert intent.requires_browser is True
    assert intent.confidence > 0
