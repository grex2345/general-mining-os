"""SelfImprovement — JARVIS learning and feedback system.

Analyzes failed operations, records successful patterns, and suggests fixes
for future executions. Never modifies core code or security policies — only
learns from operational data stored locally in memory.
"""

from __future__ import annotations

import json
import time
from typing import Any

from .memory_extended import JarvisMemory


class SelfImprovement:
    """Learns from failures and successes to improve future task execution."""

    def __init__(self, memory: JarvisMemory) -> None:
        self.memory = memory

    # ── Recording ────────────────────────────────────────────────────────
    def record_success(
        self,
        tool: str,
        arguments: dict[str, Any],
        result_text: str,
    ) -> None:
        """Record a successful tool execution as a reusable pattern."""
        key = f"success_{tool}_{int(time.time()*1000)}"
        payload = {
            "type": "success_pattern",
            "tool": tool,
            "arguments": arguments,
            "result_excerpt": result_text[:500],
            "timestamp": time.time(),
        }
        self.memory.base.save("global", key, json.dumps(payload, ensure_ascii=False), "success_pattern")

    def record_failure(
        self,
        tool: str,
        arguments: dict[str, Any],
        error: str,
        context: str,
        recovered: bool,
    ) -> None:
        """Record a failed operation for later analysis."""
        self.memory.log_error_pattern(
            project="global",
            tool=tool,
            error=str(error)[:500],
            context=context,
            recovery="recovered" if recovered else "not_recovered",
            worked=recovered,
        )

    # ── Suggestion ───────────────────────────────────────────────────────
    def suggest_fix(self, tool: str, error: str) -> dict[str, Any] | None:
        """Look up known error patterns and suggest a fix.

        Heuristic fixes are checked first so actionable advice takes priority
        over generic stored pattern notes.
        """
        error_lower = str(error).lower()

        # Heuristic fixes for common errors (checked first)
        if "not found" in error_lower and tool == "fs_edit":
            return {
                "suggested_arguments": None,
                "recovery_note": "Call fs_read first to get exact old_text, then retry fs_edit",
                "worked_before": False,
            }
        if "timed out" in error_lower or "timeout" in error_lower:
            return {
                "suggested_arguments": None,
                "recovery_note": "Command timed out — try with a shorter timeout or simpler arguments",
                "worked_before": False,
            }
        if "access" in error_lower or "permission" in error_lower:
            return {
                "suggested_arguments": None,
                "recovery_note": "Access denied — check if path is inside allowedWriteRoots or requires confirmation",
                "worked_before": False,
            }

        # Fall back to stored patterns
        patterns = self.memory.recall_error_patterns(project="global", tool=tool, limit=10)
        for pat in patterns:
            pat_error = str(pat.get("error", "")).lower()
            if pat_error and pat_error in error_lower:
                return {
                    "suggested_arguments": None,
                    "recovery_note": pat.get("recovery", "previous attempt"),
                    "worked_before": pat.get("worked", False),
                }

        return None

    # ── Workflow Reuse ───────────────────────────────────────────────────
    def find_reusable_workflow(self, objective_keywords: list[str]) -> dict[str, Any] | None:
        """Find a previously saved workflow matching keywords."""
        workflows = self.memory.list_workflows()
        for wf in workflows:
            name = wf.get("name", "").lower()
            desc = wf.get("description", "").lower()
            if any(kw in name or kw in desc for kw in objective_keywords):
                return wf
        return None
