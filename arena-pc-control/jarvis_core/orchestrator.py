"""JarvisOrchestrator — The central JARVIS brain.

Coordinates reasoning, planning, memory, PC control, verification, recovery,
and progress monitoring into one coherent autonomous system.

Typical flow for a high-level objective (e.g. "Build a YouTube video pipeline"):
  1. IntentAnalyzer: "What is the user really trying to do?"
  2. SituationalAwareness: "What is the current PC state?"
  3. TaskPlanner: "Break the objective into ordered, verifiable steps."
  4. TaskEngine: "Execute each step with policy checks, approvals, retries."
  5. Memory + SelfImprovement: "Record everything; learn from failures."
  6. Report: "What was completed, what remains, what needs your approval."
"""

from __future__ import annotations

import json
from os import PathLike
from pathlib import Path
from typing import Any, Callable

from bridge.policy import PolicyEngine  # noqa: E402
from bridge.mcp_client import MCPRouter  # noqa: E402
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop
from .reasoning import IntentAnalyzer, SituationalAwareness
from .planner import TaskPlanner, Plan
from .task_engine import TaskEngine, ExecutionResult


class JarvisOrchestrator:
    """Central orchestration engine for JARVIS-level autonomous PC control."""

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        *,
        base_dir: str | Path | None = None,
        state_dir: str | Path | None = None,
        memory_db: str | Path | None = None,
        emergency_stop: EmergencyStop | None = None,
    ) -> None:
        config = dict(config or {})
        self.config = config

        # Core infrastructure (reuses existing battle-tested components)
        self.policy = PolicyEngine(config.get("policy"))
        self.router = MCPRouter(base_dir=str(base_dir) if base_dir else str(Path.cwd()))
        self.router.load_servers(config.get("mcpServers") or {})
        self.memory = JarvisMemory(memory_db)
        self.improvement = SelfImprovement(self.memory)
        self.emergency = emergency_stop or EmergencyStop()

        # JARVIS intelligence layer
        self.analyzer = IntentAnalyzer()
        self.awareness = SituationalAwareness()
        self.planner = TaskPlanner(awareness=self.awareness.state)
        self.engine = TaskEngine(
            policy=self.policy,
            router=self.router,
            memory=self.memory,
            improvement=self.improvement,
            emergency=self.emergency,
            approval_callback=None,  # set via set_approval_callback for interactive mode
        )

        self._started = False

    # ── Lifecycle ───────────────────────────────────────────────────────
    def start(self) -> dict[str, Any]:
        """Start all MCP servers and prepare JARVIS for execution."""
        if self._started:
            return {"status": "already_running"}
        statuses = self.router.start_all()
        self._started = True
        return {"status": "started", "servers": statuses}

    def stop(self) -> None:
        """Stop all MCP servers."""
        if self._started:
            self.router.stop_all()
            self._started = False

    # ── Approval wiring ────────────────────────────────────────────────
    def set_approval_callback(
        self,
        callback: Callable[[str, dict[str, Any], str, str], bool],
    ) -> None:
        """Wire an interactive human-approval callback (e.g. from the WebSocket bridge)."""
        self.engine._approval_callback = callback

    # ── Main entry point ───────────────────────────────────────────────
    def execute_objective(
        self,
        objective: str,
        project: str | None = None,
    ) -> dict[str, Any]:
        """Execute a high-level objective autonomously.

        Returns a result dict with success status, steps completed, summary,
        and any errors requiring user attention.
        """
        self.emergency.require_running()

        # 1. Analyze intent
        intent = self.analyzer.analyze(objective, project=project)

        # 2. Situational context
        context_summary = self.awareness.get_context_summary()

        # 3. Recall relevant memory (past decisions, errors, preferences)
        past_errors = self.memory.recall_error_patterns(project="global", limit=5)
        past_tasks = self.memory.recall_task_history(project=intent.suggested_project, limit=5)

        # 4. Plan
        plan = self.planner.plan(intent)

        # 5. Execute
        result = self.engine.execute_plan(plan)

        # 6. Fold results into situational awareness
        for step_result in result.steps_results:
            self.awareness.update_from_tool_result(step_result.tool, step_result.to_dict())

        # 7. Build final report
        return {
            "objective": objective,
            "project": plan.project,
            "intent": {
                "type": intent.intent_type,
                "confidence": intent.confidence,
                "requires_browser": intent.requires_browser,
                "requires_desktop_app": intent.requires_desktop_app,
                "requires_filesystem": intent.requires_filesystem,
                "requires_shell": intent.requires_shell,
                "destructive_risk": intent.destructive_risk,
            },
            "situation": context_summary,
            "plan": {
                "rationale": plan.rationale,
                "steps": len(plan.steps),
                "requires_confirmation": plan.requires_user_confirmation,
            },
            "result": result.to_dict(),
            "memory": {
                "past_errors_count": len(past_errors),
                "past_tasks_count": len(past_tasks),
            },
        }

    def emergency_activate(self, reason: str = "user_requested") -> None:
        self.emergency.activate(reason)

    def emergency_reset(self, authorized_by: str = "user") -> None:
        self.emergency.reset(authorized_by)

    def is_emergency_stopped(self) -> bool:
        return self.emergency.is_stopped

    # ── Memory access ───────────────────────────────────────────────────
    def save_preference(self, key: str, value: str) -> dict[str, Any]:
        return self.memory.save_user_preference(key, value)

    def recall_preference(self, key: str) -> str | None:
        return self.memory.recall_user_preference(key)

    def list_projects(self) -> list[dict[str, Any]]:
        return self.memory.base.list_projects()

    def save_workflow(self, name: str, steps: list[dict[str, Any]], description: str = "") -> dict[str, Any]:
        return self.memory.save_workflow(name, steps, description)

    def list_workflows(self) -> list[dict[str, Any]]:
        return self.memory.list_workflows()


def build_jarvis_from_config(config_path: str | None = None) -> JarvisOrchestrator:
    """Factory: build a JarvisOrchestrator from the standard config file."""
    root = Path(__file__).resolve().parent.parent
    cfg_path = Path(config_path) if config_path else (root / "config.default.json")
    with open(cfg_path, "r", encoding="utf-8") as fh:
        config = json.load(fh)
    return JarvisOrchestrator(config=config, base_dir=str(root))
