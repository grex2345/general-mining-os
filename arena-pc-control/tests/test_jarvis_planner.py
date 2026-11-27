"""Tests for JARVIS TaskPlanner."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.reasoning import IntentAnalyzer  # noqa: E402
from jarvis_core.planner import TaskPlanner  # noqa: E402


def test_planner_produces_steps_for_web_objective() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Open YouTube and search for Python tutorials")
    planner = TaskPlanner()
    plan = planner.plan(intent)

    assert plan.objective == intent.objective
    assert len(plan.steps) >= 2
    # First step should be open_url or list-related
    tool_names = [s.tool for s in plan.steps]
    assert "open_url" in tool_names or "web_fetch_readable" in tool_names
    assert plan.rationale is not None and len(plan.rationale) > 0


def test_planner_produces_steps_for_file_objective() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Create a notes file in ~/Documents with my meeting summary")
    planner = TaskPlanner()
    plan = planner.plan(intent)

    tool_names = [s.tool for s in plan.steps]
    assert "fs_list" in tool_names
    assert "fs_write" in tool_names
    # Memory step should always be present
    assert "memory_save" in tool_names


def test_planner_produces_steps_for_system_info() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("hello random text")
    planner = TaskPlanner()
    plan = planner.plan(intent)

    assert any(s.tool == "system_info" for s in plan.steps)
    assert any(s.tool == "memory_save" for s in plan.steps)


def test_step_structure() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Read a file from the desktop")
    planner = TaskPlanner()
    plan = planner.plan(intent)

    for step in plan.steps:
        assert step.id
        assert step.description
        assert step.tool
        assert isinstance(step.arguments, dict)
        assert step.expected_outcome
        assert step.risk_tier in ("allow", "confirm", "deny")
        assert step.verification
        assert step.max_retries >= 1
        assert step.retry_count == 0
