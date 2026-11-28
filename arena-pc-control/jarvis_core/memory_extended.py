"""JarvisMemory — Extended persistent memory for JARVIS.

Builds on the existing MemoryStore (SQLite WAL) and adds:

  * project_architecture  — folder layout, key files, tech stack, build/run commands
  * decision_log          — what was decided, why, who/what approved it, when
  * task_history          — objectives, plans, step results, success/failure
  * error_patterns        — failed operations + recovery that worked
  * user_preferences      — working style, preferred tools, confirmation thresholds
  * successful_workflows  — reusable step sequences for recurring objectives

All data stays local in ~/.arena-pc-control/memory.db (or a configurable path).
Nothing is ever transmitted externally without explicit user approval.
"""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any

from bridge.memory import MemoryStore  # noqa: E402


class JarvisMemory:
    """Extended memory layer for JARVIS context persistence."""

    _CATEGORY_PROJECT_ARCH = "project_architecture"
    _CATEGORY_DECISION = "decision_log"
    _CATEGORY_TASK_HISTORY = "task_history"
    _CATEGORY_ERROR_PATTERN = "error_pattern"
    _CATEGORY_USER_PREF = "user_preference"
    _CATEGORY_WORKFLOW = "successful_workflow"

    def __init__(self, db_path: str | Path | None = None) -> None:
        self.base = MemoryStore(db_path)

    # ── Project Architecture ─────────────────────────────────────────────
    def save_project_architecture(
        self,
        project: str,
        architecture: dict[str, Any],
    ) -> dict[str, Any]:
        """Save a snapshot of a project's structure and configuration."""
        payload = {
            "type": "project_architecture",
            "architecture": architecture,
            "updated_at": time.time(),
        }
        saved = self.base.save(
            project,
            "_architecture",
            json.dumps(payload, ensure_ascii=False),
            self._CATEGORY_PROJECT_ARCH,
        )
        return {"ok": True, "saved": saved}

    def recall_project_architecture(self, project: str) -> dict[str, Any] | None:
        """Recall the last saved architecture for a project."""
        entries = self.base.recall(project=project, query="_architecture", limit=1)
        if not entries:
            return None
        try:
            return json.loads(entries[0]["value"])
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    # ── Decision Log ─────────────────────────────────────────────────────
    def log_decision(
        self,
        project: str,
        decision: str,
        rationale: str,
        tool_used: str | None = None,
        approved_by: str | None = None,
        outcome: str | None = None,
    ) -> dict[str, Any]:
        """Record a decision made during task execution."""
        key = f"decision_{int(time.time()*1000)}"
        payload = {
            "type": "decision",
            "decision": decision,
            "rationale": rationale,
            "tool_used": tool_used,
            "approved_by": approved_by,
            "outcome": outcome,
            "timestamp": time.time(),
        }
        saved = self.base.save(
            project, key, json.dumps(payload, ensure_ascii=False), self._CATEGORY_DECISION
        )
        return {"ok": True, "saved": saved}

    def recall_decisions(self, project: str, limit: int = 20) -> list[dict[str, Any]]:
        """Recall recent decisions for a project."""
        entries = self.base.recall(project=project, query="decision_", limit=limit)
        results: list[dict[str, Any]] = []
        for e in entries:
            try:
                results.append(json.loads(e["value"]))
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
        return results

    # ── Task History ─────────────────────────────────────────────────────
    def log_task_history(
        self,
        project: str,
        objective: str,
        plan_summary: str,
        steps_completed: int,
        total_steps: int,
        success: bool,
        summary: str,
        errors: list[str] | None = None,
    ) -> dict[str, Any]:
        """Record the outcome of a completed task."""
        key = f"task_{int(time.time()*1000)}"
        payload = {
            "type": "task_history",
            "objective": objective,
            "plan_summary": plan_summary,
            "steps_completed": steps_completed,
            "total_steps": total_steps,
            "success": success,
            "summary": summary,
            "errors": errors or [],
            "timestamp": time.time(),
        }
        saved = self.base.save(
            project, key, json.dumps(payload, ensure_ascii=False), self._CATEGORY_TASK_HISTORY
        )
        return {"ok": True, "saved": saved}

    def recall_task_history(self, project: str, limit: int = 20) -> list[dict[str, Any]]:
        """Recall recent task history for a project."""
        entries = self.base.recall(project=project, query="task_", limit=limit)
        results: list[dict[str, Any]] = []
        for e in entries:
            try:
                results.append(json.loads(e["value"]))
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
        return results

    # ── Error Patterns ───────────────────────────────────────────────────
    def log_error_pattern(
        self,
        project: str,
        tool: str,
        error: str,
        context: str,
        recovery: str,
        worked: bool,
    ) -> dict[str, Any]:
        """Record an error and how it was (or wasn't) recovered."""
        key = f"error_{int(time.time()*1000)}"
        payload = {
            "type": "error_pattern",
            "tool": tool,
            "error": error,
            "context": context,
            "recovery": recovery,
            "worked": worked,
            "timestamp": time.time(),
        }
        saved = self.base.save(
            project, key, json.dumps(payload, ensure_ascii=False), self._CATEGORY_ERROR_PATTERN
        )
        return {"ok": True, "saved": saved}

    def recall_error_patterns(self, project: str, tool: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        """Recall past error patterns, optionally filtered by tool."""
        query = tool or "error_"
        entries = self.base.recall(project=project, query=query, limit=limit)
        results: list[dict[str, Any]] = []
        for e in entries:
            try:
                pat = json.loads(e["value"])
                if tool is None or pat.get("tool") == tool:
                    results.append(pat)
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
        return results

    # ── User Preferences ─────────────────────────────────────────────────
    def save_user_preference(self, key: str, value: str, category: str = "preference") -> dict[str, Any]:
        saved = self.base.save("global", key, value, category)
        return {"ok": True, "saved": saved}

    def recall_user_preference(self, key: str) -> str | None:
        entries = self.base.recall(project="global", query=key, limit=1)
        if entries:
            return entries[0]["value"]
        return None

    # ── Successful Workflows ─────────────────────────────────────────────
    def save_workflow(self, name: str, steps: list[dict[str, Any]], description: str = "") -> dict[str, Any]:
        key = f"workflow_{name}"
        payload = {
            "type": "workflow",
            "name": name,
            "description": description,
            "steps": steps,
            "timestamp": time.time(),
        }
        saved = self.base.save(
            "global", key, json.dumps(payload, ensure_ascii=False), self._CATEGORY_WORKFLOW
        )
        return {"ok": True, "saved": saved}

    def recall_workflow(self, name: str) -> dict[str, Any] | None:
        entries = self.base.recall(project="global", query=f"workflow_{name}", limit=1)
        if entries:
            try:
                return json.loads(entries[0]["value"])
            except (json.JSONDecodeError, KeyError, TypeError):
                return None
        return None

    def list_workflows(self) -> list[dict[str, Any]]:
        entries = self.base.recall(project="global", query="workflow_", limit=100)
        results: list[dict[str, Any]] = []
        for e in entries:
            try:
                results.append(json.loads(e["value"]))
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
        return results

    # ── Cross-cutting Recall ─────────────────────────────────────────────
    def recall_context(self, project: str, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """General-purpose semantic-ish recall across all memory categories."""
        return self.base.recall(project=project, query=query, limit=limit)
