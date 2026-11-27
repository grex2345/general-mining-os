"""Tests for JARVIS TaskEngine step execution with verification and recovery."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.policy import ActionTier, PolicyEngine  # noqa: E402
from bridge.mcp_client import MCPRouter  # noqa: E402
from jarvis_core.memory_extended import JarvisMemory  # noqa: E402
from jarvis_core.self_improvement import SelfImprovement  # noqa: E402
from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402
from jarvis_core.task_engine import TaskEngine, StepResult  # noqa: E402
from jarvis_core.planner import Plan, TaskStep  # noqa: E402


def _make_engine(tmp_path: Path) -> TaskEngine:
    mem_db = tmp_path / "engine_mem.db"
    router = MCPRouter(base_dir=ROOT)
    router.load_servers(
        {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(mem_db)},
            }
        }
    )
    router.start_all()
    policy = PolicyEngine(
        {"allowedWriteRoots": [str(tmp_path / "workspace")], "requireConfirmForShell": True}
    )
    memory = JarvisMemory(mem_db)
    improvement = SelfImprovement(memory)
    emergency = EmergencyStop(tmp_path / "emergency_engine.json")
    engine = TaskEngine(policy, router, memory, improvement, emergency)
    return engine, router


def test_engine_executes_allowed_step(tmp_path: Path) -> None:
    engine, router = _make_engine(tmp_path)
    try:
        test_file = tmp_path / "workspace" / "engine_test.txt"
        step = TaskStep(
            id="s1",
            description="Write a test file",
            tool="fs_write",
            arguments={"path": str(test_file), "content": "hello engine"},
            expected_outcome="File written",
            risk_tier="allow",
            verification="ok=true",
        )
        plan = Plan(
            objective="test write",
            project="global",
            steps=[step],
            rationale="test",
            estimated_duration_seconds=5,
            requires_user_confirmation=False,
        )
        result = engine.execute_plan(plan)
        assert result.success is True
        assert result.steps_completed == 1
        assert test_file.read_text(encoding="utf-8") == "hello engine"
    finally:
        router.stop_all()


def test_engine_blocks_denied_step(tmp_path: Path) -> None:
    engine, router = _make_engine(tmp_path)
    try:
        step = TaskStep(
            id="s1",
            description="Attempt privilege escalation",
            tool="shell_exec",
            arguments={"command": "Start-Process cmd -Verb RunAs"},
            expected_outcome="Should be blocked",
            risk_tier="deny",
            verification="blocked",
        )
        plan = Plan(
            objective="test deny",
            project="global",
            steps=[step],
            rationale="test",
            estimated_duration_seconds=5,
            requires_user_confirmation=False,
        )
        result = engine.execute_plan(plan)
        assert result.success is False
        assert result.steps_results[0].policy_blocked is True
    finally:
        router.stop_all()


def test_engine_emergency_stop_halt(tmp_path: Path) -> None:
    engine, router = _make_engine(tmp_path)
    try:
        engine.emergency.activate()
        step = TaskStep(
            id="s1",
            description="Should not run",
            tool="system_info",
            arguments={},
            expected_outcome="n/a",
            risk_tier="allow",
            verification="n/a",
        )
        plan = Plan(
            objective="test halt",
            project="global",
            steps=[step],
            rationale="test",
            estimated_duration_seconds=5,
            requires_user_confirmation=False,
        )
        try:
            engine.execute_plan(plan)
            assert False, "Should have raised RuntimeError"
        except RuntimeError as exc:
            assert "EMERGENCY STOP" in str(exc)
    finally:
        router.stop_all()
