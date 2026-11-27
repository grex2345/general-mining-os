"""JARVIS Agent Loop — 12-step intelligent execution loop.

Implements the full autonomous execution cycle:

  1. Receive objective
  2. Understand intent
  3. Inspect current environment
  4. Plan the task
  5. Identify required tools
  6. Execute the next action
  7. Observe the result
  8. Evaluate whether the action succeeded
  9. Recover from errors if necessary
  10. Continue until the objective is completed
  11. Verify the final output
  12. Report results

JARVIS never blindly executes long sequences — it checks every result and
recovers from errors before continuing.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
import time

from bridge.policy import PolicyEngine  # noqa: E402
from bridge.mcp_client import MCPRouter  # noqa: E402
from bridge.session_manager import session_manager  # noqa: E402
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop
from .reasoning import IntentAnalyzer, SituationalAwareness
from .planner import TaskPlanner, Plan, TaskStep
from .task_engine import TaskEngine, StepResult, ExecutionResult
from .model_provider import model_provider_manager


@dataclass
class AgentLoopResult:
    """Final result of the JARVIS agent loop."""

    objective: str
    project: str
    session_id: str
    success: bool
    steps_completed: int
    total_steps: int
    summary: str
    errors: list[str]
    execution_log: list[dict[str, Any]]
    completed_at: float


class JarvisAgentLoop:
    """The autonomous JARVIS execution loop with full intelligence."""

    def __init__(
        self,
        policy: PolicyEngine | None = None,
        router: MCPRouter | None = None,
        memory: JarvisMemory | None = None,
        improvement: SelfImprovement | None = None,
        emergency: EmergencyStop | None = None,
        session_id: str | None = None,
        project: str = "global",
    ) -> None:
        self.policy = policy or PolicyEngine()
        self.router = router or MCPRouter()
        self.memory = memory or JarvisMemory()
        self.improvement = improvement or SelfImprovement(self.memory)
        self.emergency = emergency or EmergencyStop()
        self.session_id = session_id or session_manager.create_session(
            agent_type="jarvis_independent", provider="jarvis_core"
        ).session_id
        self.project = project

        self.analyzer = IntentAnalyzer()
        self.awareness = SituationalAwareness()
        self.planner = TaskPlanner(awareness=self.awareness.state)
        self.engine = TaskEngine(
            policy=self.policy,
            router=self.router,
            memory=self.memory,
            improvement=self.improvement,
            emergency=self.emergency,
            approval_callback=None,  # Headless mode: deny CONFIRM by default
        )

        self._started = False
        self.execution_log: list[dict[str, Any]] = []

    # ── Lifecycle ─────────────────────────────────────────────────────
    def start(self) -> dict[str, Any]:
        if self._started:
            return {"status": "already_running", "session_id": self.session_id}
        statuses = self.router.start_all()
        self._started = True
        self._log("system", "JARVIS agent loop started", {"session_id": self.session_id})
        return {"status": "started", "session_id": self.session_id, "servers": statuses}

    def stop(self) -> None:
        if self._started:
            self.router.stop_all()
            self._started = False
        self._log("system", "JARVIS agent loop stopped", {"session_id": self.session_id})

    # ── The 12-step loop ─────────────────────────────────────────────
    async def run_objective(
        self,
        objective: str,
        project: str | None = None,
        max_steps: int = 50,
    ) -> AgentLoopResult:
        """Execute a high-level objective autonomously through the 12-step loop."""
        self.emergency.require_running()
        project = project or self.project

        self._log("step_1_receive", "Objective received", {"objective": objective})

        # Step 2: Understand intent
        intent = self.analyzer.analyze(objective, project=project)
        self._log(
            "step_2_understand",
            "Intent analyzed",
            {
                "type": intent.intent_type,
                "confidence": intent.confidence,
                "requires_browser": intent.requires_browser,
                "requires_desktop_app": intent.requires_desktop_app,
                "requires_filesystem": intent.requires_filesystem,
                "requires_shell": intent.requires_shell,
                "destructive_risk": intent.destructive_risk,
            },
        )

        # Step 3: Inspect current environment
        system_info = self.router.call_tool("system_info", {})
        self.awareness.update_from_tool_result("system_info", system_info.to_dict() if hasattr(system_info, 'to_dict') else system_info)
        context_summary = self.awareness.get_context_summary()
        self._log("step_3_inspect", "Environment inspected", {"context": context_summary})

        # Recall memory for context
        past_errors = self.memory.recall_error_patterns(project="global", limit=5)
        past_tasks = self.memory.recall_task_history(project=project, limit=5)
        self._log(
            "step_3_memory",
            "Memory recalled",
            {"past_errors": len(past_errors), "past_tasks": len(past_tasks)},
        )

        # Step 4 & 5: Plan and identify tools
        plan = self.planner.plan(intent)
        self._log(
            "step_4_5_plan",
            "Plan created",
            {
                "rationale": plan.rationale,
                "steps": len(plan.steps),
                "requires_confirmation": plan.requires_user_confirmation,
            },
        )

        # Check if plan needs human confirmation (CONFIRM-tier steps)
        if plan.requires_user_confirmation:
            self._log(
                "step_5_confirm",
                "Plan requires human confirmation",
                {"message": "Some steps need your approval before execution."},
            )

        # Step 6-10: Execute with verification and recovery
        result = self.engine.execute_plan(plan)

        # Fold results into awareness
        for step_result in result.steps_results:
            self.awareness.update_from_tool_result(step_result.tool, step_result.to_dict())

        # Step 11: Verify final output
        verification = self._verify_final_result(objective, result)
        self._log("step_11_verify", "Final verification", verification)

        # Step 12: Report results
        summary = self._build_final_report(objective, project, result, verification)
        self._log("step_12_report", "Results reported", {"success": result.success})

        # Record task history in memory
        self.memory.log_task_history(
            project=project,
            objective=objective,
            plan_summary=plan.rationale,
            steps_completed=result.steps_completed,
            total_steps=result.total_steps,
            success=result.success,
            summary=summary,
            errors=result.errors,
        )

        return AgentLoopResult(
            objective=objective,
            project=project,
            session_id=self.session_id,
            success=result.success,
            steps_completed=result.steps_completed,
            total_steps=result.total_steps,
            summary=summary,
            errors=result.errors,
            execution_log=self.execution_log,
            completed_at=time.time(),
        )

    # ── Helpers ───────────────────────────────────────────────────────
    def _log(self, step: str, message: str, data: dict[str, Any] | None = None) -> None:
        entry = {
            "step": step,
            "message": message,
            "ts": time.time(),
            "data": data or {},
        }
        self.execution_log.append(entry)

    def _verify_final_result(
        self, objective: str, result: ExecutionResult
    ) -> dict[str, Any]:
        """Heuristic verification of the final result."""
        return {
            "all_steps_ok": all(r.ok for r in result.steps_results),
            "steps_completed": result.steps_completed,
            "total_steps": result.total_steps,
            "errors": result.errors,
            "likely_complete": result.success and len(result.errors) == 0,
        }

    def _build_final_report(
        self,
        objective: str,
        project: str,
        result: ExecutionResult,
        verification: dict[str, Any],
    ) -> str:
        done = result.steps_completed
        total = result.total_steps
        if result.success:
            return f"JARVIS completed objective '{objective}' successfully ({done}/{total} steps)."
        return (
            f"JARVIS partially completed objective '{objective}' ({done}/{total} steps). "
            f"{len(result.errors)} issue(s) require attention: {'; '.join(result.errors[:3])}"
        )

    # ── Status ────────────────────────────────────────────────────────
    def get_status(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "project": self.project,
            "started": self._started,
            "emergency_stopped": self.emergency.is_stopped,
            "servers": self.router.server_statuses() if self._started else [],
            "sessions": session_manager.list_sessions(),
            "execution_log_count": len(self.execution_log),
        }


def create_jarvis_agent(
    config: dict[str, Any] | None = None,
    session_id: str | None = None,
    project: str = "global",
) -> JarvisAgentLoop:
    """Factory: create a JARVIS agent loop instance.

    If no config is provided, loads from config.default.json so that the
    built-in local_pc MCP server is registered and available on start().
    """
    from pathlib import Path as _P
    import json as _json

    if config is None:
        _root = _P(__file__).resolve().parent.parent
        with open(_root / "config.default.json", "r", encoding="utf-8") as _f:
            config = _json.load(_f)
    config = dict(config)
    policy = PolicyEngine(config.get("policy"))
    router = MCPRouter()
    router.load_servers(config.get("mcpServers") or {})
    memory = JarvisMemory()
    improvement = SelfImprovement(memory)
    emergency = EmergencyStop()

    return JarvisAgentLoop(
        policy=policy,
        router=router,
        memory=memory,
        improvement=improvement,
        emergency=emergency,
        session_id=session_id,
        project=project,
    )
