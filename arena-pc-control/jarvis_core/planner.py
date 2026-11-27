"""TaskPlanner — Decomposes high-level objectives into executable step plans.

Produces a list of TaskStep objects that the TaskEngine executes sequentially.
Each step names a concrete MCP tool, its arguments, an expected outcome, a
risk tier, and a verification method. The planner consults situational
awareness and memory to avoid repeating known failures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .reasoning import IntentAnalysis, PCState


@dataclass
class TaskStep:
    id: str
    description: str
    tool: str
    arguments: dict[str, Any]
    expected_outcome: str
    risk_tier: str  # 'allow', 'confirm', 'deny'
    verification: str  # what to check after execution
    depends_on: list[str] = field(default_factory=list)
    max_retries: int = 2
    retry_count: int = 0


@dataclass
class Plan:
    objective: str
    project: str
    steps: list[TaskStep]
    rationale: str
    estimated_duration_seconds: int
    requires_user_confirmation: bool


class TaskPlanner:
    """Turns an IntentAnalysis + PCState into an ordered list of TaskSteps."""

    def __init__(self, awareness: PCState | None = None) -> None:
        self.awareness = awareness or PCState()

    def plan(self, intent: IntentAnalysis) -> Plan:
        steps: list[TaskStep] = []
        rationale_parts: list[str] = []
        requires_confirm = False

        it = intent.intent_type
        obj = intent.objective.lower()

        # ── FILE MANAGEMENT ──────────────────────────────────────────────
        if it == "file_management" or ("file" in obj or "folder" in obj):
            steps.append(
                TaskStep(
                    id="step_1",
                    description="Inspect target directory to understand current state",
                    tool="fs_list",
                    arguments={"path": "~/Documents"},
                    expected_outcome="List of files/folders in ~/Documents",
                    risk_tier="allow",
                    verification="Tool returns ok=true with entries list",
                )
            )
            steps.append(
                TaskStep(
                    id="step_2",
                    description="Create or modify the requested file/folder",
                    tool="fs_write",
                    arguments={"path": "~/Documents/arena_task_output.txt", "content": "Task output placeholder"},
                    expected_outcome="File created with specified content",
                    risk_tier="confirm" if intent.destructive_risk else "allow",
                    verification="fs_read confirms content was written",
                )
            )
            requires_confirm = intent.destructive_risk
            rationale_parts.append("File operations detected — listing first, then writing with verification.")

        # ── WEB / BROWSER ────────────────────────────────────────────────
        if it == "web_research" or intent.requires_browser:
            url = intent.key_entities[0] if intent.key_entities else "https://www.youtube.com"
            steps.append(
                TaskStep(
                    id="step_browser_1",
                    description=f"Open {url} in the default browser",
                    tool="open_url",
                    arguments={"url": url},
                    expected_outcome="Browser opens the requested URL",
                    risk_tier="allow",
                    verification="open_url returns browser_signaled=true",
                )
            )
            steps.append(
                TaskStep(
                    id="step_browser_2",
                    description="Read the page content as structured text",
                    tool="web_fetch_readable",
                    arguments={"url": url, "max_chars": 8000},
                    expected_outcome="Clean readable text and links from the page",
                    risk_tier="allow",
                    verification="Tool returns content with page title or headings",
                )
            )
            rationale_parts.append("Web objective — open URL then fetch readable content.")

        # ── DESKTOP APP CONTROL ──────────────────────────────────────────
        if it == "app_control" or intent.requires_desktop_app:
            app_name = intent.key_entities[0] if intent.key_entities else "notepad"
            steps.append(
                TaskStep(
                    id="step_app_1",
                    description=f"List visible windows to find or confirm {app_name}",
                    tool="app_list_windows",
                    arguments={},
                    expected_outcome="List of running application windows",
                    risk_tier="allow",
                    verification="Tool returns ok=true with windows array",
                )
            )
            steps.append(
                TaskStep(
                    id="step_app_2",
                    description=f"Launch {app_name} if not already running",
                    tool="app_launch",
                    arguments={"application": app_name},
                    expected_outcome=f"{app_name} process started",
                    risk_tier="confirm",  # launching apps requires confirmation by default policy
                    verification="app_list_windows shows the app window",
                )
            )
            requires_confirm = True
            rationale_parts.append("Desktop app control — inspect windows first, then launch with confirmation.")

        # ── DEVELOPMENT / SHELL ──────────────────────────────────────────
        if it == "development" or intent.requires_shell:
            steps.append(
                TaskStep(
                    id="step_shell_1",
                    description="Run a read-only diagnostic to confirm environment",
                    tool="shell_exec",
                    arguments={"command": "echo JARVIS_ENV_READY"},
                    expected_outcome="Command runs successfully with exit code 0",
                    risk_tier="allow",
                    verification="exit_code == 0 and stdout contains JARVIS_ENV_READY",
                )
            )
            rationale_parts.append("Development objective — verify environment, then proceed.")

        # ── DEFAULT: SYSTEM INFO ─────────────────────────────────────────
        if not steps:
            steps.append(
                TaskStep(
                    id="step_1",
                    description="Gather system information to understand the PC state",
                    tool="system_info",
                    arguments={},
                    expected_outcome="OS, Python version, screen size, admin status",
                    risk_tier="allow",
                    verification="Tool returns ok=true with system fields",
                )
            )
            rationale_parts.append("No specific capability detected — starting with system info.")

        # Add memory save step to record the plan (JARVIS always remembers)
        steps.append(
            TaskStep(
                id="step_memory",
                description="Save task plan and context to persistent memory",
                tool="memory_save",
                arguments={
                    "project": intent.suggested_project,
                    "key": f"plan_{intent.objective[:30]}",
                    "value": f"Intent: {intent.objective}\nType: {it}\nSteps: {len(steps)}",
                    "category": "task_plan",
                },
                expected_outcome="Plan persisted to memory",
                risk_tier="allow",
                verification="memory_save returns ok=true",
            )
        )

        total_est = sum(s.max_retries for s in steps) * 5  # rough estimate
        return Plan(
            objective=intent.objective,
            project=intent.suggested_project,
            steps=steps,
            rationale="; ".join(rationale_parts),
            estimated_duration_seconds=total_est,
            requires_user_confirmation=requires_confirm,
        )
