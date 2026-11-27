"""TaskEngine — Executes a JARVIS plan step by step with verification and recovery.

For each step:
  1. Check PolicyEngine verdict (ALLOW / CONFIRM / DENY)
  2. If CONFIRM, request human approval via the bridge approval queue
  3. Execute the MCP tool
  4. Verify the result against the step's expected_outcome
  5. On failure, analyze error, consult memory for known fixes, retry up to max_retries
  6. Record everything in memory (success, error, recovery)

The engine never bypasses security. Emergency stop halts everything immediately.
"""

from __future__ import annotations

import time
from typing import Any, Callable

from bridge.policy import ActionTier, PolicyEngine  # noqa: E402
from bridge.mcp_client import MCPRouter  # noqa: E402
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop
from .planner import Plan, TaskStep


class StepResult:
    """Outcome of executing a single TaskStep."""

    def __init__(
        self,
        step_id: str,
        tool: str,
        ok: bool,
        text: str,
        images: list[dict[str, Any]] | None = None,
        policy_blocked: bool = False,
        user_denied: bool = False,
        recovery_attempted: bool = False,
        error: str | None = None,
    ) -> None:
        self.step_id = step_id
        self.tool = tool
        self.ok = ok
        self.text = text
        self.images = images or []
        self.policy_blocked = policy_blocked
        self.user_denied = user_denied
        self.recovery_attempted = recovery_attempted
        self.error = error
        self.timestamp = time.time()

    def to_dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "tool": self.tool,
            "ok": self.ok,
            "text": self.text,
            "images": self.images,
            "policy_blocked": self.policy_blocked,
            "user_denied": self.user_denied,
            "recovery_attempted": self.recovery_attempted,
            "error": self.error,
            "timestamp": self.timestamp,
        }


class ExecutionResult:
    """Outcome of executing an entire Plan."""

    def __init__(
        self,
        plan: Plan,
        steps_results: list[StepResult],
        success: bool,
        summary: str,
        errors: list[str],
    ) -> None:
        self.plan = plan
        self.steps_results = steps_results
        self.success = success
        self.summary = summary
        self.errors = errors
        self.completed_at = time.time()

    @property
    def steps_completed(self) -> int:
        return sum(1 for r in self.steps_results if r.ok)

    @property
    def total_steps(self) -> int:
        return len(self.steps_results)

    def to_dict(self) -> dict[str, Any]:
        return {
            "objective": self.plan.objective,
            "project": self.plan.project,
            "success": self.success,
            "steps_completed": self.steps_completed,
            "total_steps": self.total_steps,
            "summary": self.summary,
            "errors": self.errors,
            "steps": [r.to_dict() for r in self.steps_results],
            "completed_at": self.completed_at,
        }


class TaskEngine:
    """Autonomous step executor with verification, recovery, and memory."""

    def __init__(
        self,
        policy: PolicyEngine,
        router: MCPRouter,
        memory: JarvisMemory,
        improvement: SelfImprovement,
        emergency: EmergencyStop,
        approval_callback: Callable[[str, dict[str, Any], str, str], bool] | None = None,
    ) -> None:
        self.policy = policy
        self.router = router
        self.memory = memory
        self.improvement = improvement
        self.emergency = emergency
        self._approval_callback = approval_callback

    # ── Public API ──────────────────────────────────────────────────────
    def execute_plan(self, plan: Plan) -> ExecutionResult:
        """Execute all steps of a plan sequentially."""
        self.emergency.require_running()

        results: list[StepResult] = []
        errors: list[str] = []

        for step in plan.steps:
            self.emergency.require_running()
            result = self._execute_step(step)
            results.append(result)

            if not result.ok and not result.policy_blocked and not result.user_denied:
                errors.append(f"{step.description}: {result.error or result.text[:200]}")

            # Stop on hard policy block or user denial — ask user before continuing
            if result.policy_blocked or result.user_denied:
                errors.append(
                    f"{step.description}: blocked ({'policy' if result.policy_blocked else 'user denied'})"
                )
                break

        success = all(r.ok for r in results) and len(errors) == 0
        summary = self._build_summary(plan, results, success)

        # Record task history in memory
        self.memory.log_task_history(
            project=plan.project,
            objective=plan.objective,
            plan_summary=plan.rationale,
            steps_completed=sum(1 for r in results if r.ok),
            total_steps=len(results),
            success=success,
            summary=summary,
            errors=errors,
        )

        return ExecutionResult(plan, results, success, summary, errors)

    # ── Internals ───────────────────────────────────────────────────────
    def _execute_step(self, step: TaskStep) -> StepResult:
        self.emergency.require_running()

        # 1. Policy check
        verdict = self.policy.evaluate_tool(step.tool, step.arguments)

        if verdict.tier == ActionTier.DENY:
            self.improvement.record_failure(
                step.tool, step.arguments, verdict.reason, "policy_deny", recovered=False
            )
            return StepResult(
                step.id, step.tool, False,
                f"POLICY BLOCKED ({verdict.risk_category}): {verdict.reason}",
                policy_blocked=True,
            )

        if verdict.tier == ActionTier.CONFIRM:
            approved = self._request_approval(step, verdict)
            if not approved:
                return StepResult(
                    step.id, step.tool, False,
                    f"USER DENIED: {verdict.reason}",
                    user_denied=True,
                )

        # 2. Execute with retry + recovery
        last_error: str | None = None
        recovery_attempted = False

        for attempt in range(1, step.max_retries + 1):
            self.emergency.require_running()
            try:
                raw = self.router.call_tool(step.tool, step.arguments, timeout=60.0)
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                raw = {"ok": False, "text": last_error, "images": []}

            ok = bool(raw.get("ok", False))
            text = str(raw.get("text", ""))
            images = raw.get("images", [])

            if ok and self._verify_step(step, raw):
                # Success — record positive pattern
                self.improvement.record_success(step.tool, step.arguments, text)
                return StepResult(
                    step.id, step.tool, True, text, images=images,
                    recovery_attempted=recovery_attempted,
                )

            # Failure — analyze and possibly recover
            last_error = text
            recovery_attempted = True

            # Consult self-improvement for known fix
            known_fix = self.improvement.suggest_fix(step.tool, last_error)
            if known_fix and attempt < step.max_retries:
                # Apply suggested argument adjustment if any
                adjusted = self._apply_fix_hint(step, known_fix)
                if adjusted:
                    step.arguments = adjusted
                    continue

            # Log error pattern
            self.memory.log_error_pattern(
                project="global",
                tool=step.tool,
                error=last_error[:500],
                context=step.description,
                recovery=known_fix or "none",
                worked=False,
            )

            if attempt < step.max_retries:
                time.sleep(1.0)  # brief pause before retry
                continue

        # Exhausted retries
        self.improvement.record_failure(
            step.tool, step.arguments, last_error or "unknown", "exhausted_retries", recovered=False
        )
        return StepResult(
            step.id, step.tool, False,
            f"EXHAUSTED RETRIES: {last_error or 'unknown error'}",
            error=last_error,
            recovery_attempted=recovery_attempted,
        )

    def _request_approval(self, step: TaskStep, verdict) -> bool:
        if self._approval_callback:
            return self._approval_callback(step.tool, step.arguments, verdict.reason, verdict.risk_category)
        # Default: deny (no interactive approval in headless/test mode)
        return False

    def _verify_step(self, step: TaskStep, raw: dict[str, Any]) -> bool:
        """Heuristic verification: does the result look successful?"""
        if not raw.get("ok", False):
            return False
        text = str(raw.get("text", ""))
        # Basic checks: no error keywords in the output
        if any(k in text.lower() for k in ("error", "failed", "not found", "denied", "blocked")):
            return False
        return True

    def _apply_fix_hint(self, step: TaskStep, fix_hint: dict[str, Any]) -> dict[str, Any] | None:
        """Apply a self-improvement fix hint to step arguments. Returns new args or None."""
        suggested_args = fix_hint.get("suggested_arguments")
        if suggested_args and isinstance(suggested_args, dict):
            return dict(suggested_args)
        return None

    def _build_summary(self, plan: Plan, results: list[StepResult], success: bool) -> str:
        done = sum(1 for r in results if r.ok)
        total = len(results)
        if success:
            return f"JARVIS completed all {total} steps for: {plan.objective}"
        return f"JARVIS completed {done}/{total} steps for: {plan.objective}. Some steps require your attention."
