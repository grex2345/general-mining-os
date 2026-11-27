"""Arena PC Control Orchestrator — Bridge & Session Coordination Layer.

This module coordinates the shared local Bridge, MCP Router, session isolation,
and infrastructure tools for the Arena-controlled workflow.

ARCHITECTURAL ROLE:
  The existing Arena AI Agent (inside Arena.ai) is the brain — it reasons,
  plans, and decides. This orchestrator is purely execution infrastructure:
  it provides tools, manages sessions, routes tool calls/results, enforces
  security policies, and coordinates PC operations. It does NOT perform
  independent AI reasoning or replace the Arena Agent.

Responsibilities:
  • Start/stop the shared local Bridge and MCP servers
  • Manage multi-agent sessions with unique session IDs
  • Enforce PolicyEngine (ALLOW/CONFIRM/DENY) security boundaries
  • Route tool requests and results between Bridge and MCP servers
  • Maintain resource locking to prevent conflicting PC operations
  • Provide emergency stop kill switch
  • Maintain audit logging

No OpenAI, Anthropic, Gemini, Ollama, or other AI API is required.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Ensure the project root is on sys.path so `bridge.*` imports resolve
# regardless of how this package is imported.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from bridge.policy import PolicyEngine  # noqa: E402
from bridge.mcp_client import MCPRouter  # noqa: E402
from bridge.session_manager import session_manager  # noqa: E402
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop


class ArenaPCOrchestrator:
    """Orchestrates the shared PC-control infrastructure for Arena Agents.

    This is NOT an AI agent. It provides execution infrastructure only:
    session management, tool routing, policy enforcement, and resource
    coordination. The Arena AI Agent retains full control of reasoning
    and decision-making.
    """

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        *,
        base_dir: str | Path | None = None,
        memory_db: str | Path | None = None,
        emergency_stop: EmergencyStop | None = None,
    ) -> None:
        config = dict(config or {})
        self.config = config

        # Core infrastructure (execution only — no AI reasoning)
        self.policy = PolicyEngine(config.get("policy"))
        self.router = MCPRouter(base_dir=str(base_dir) if base_dir else str(Path.cwd()))
        self.router.load_servers(config.get("mcpServers") or {})
        self.memory = JarvisMemory(memory_db)
        self.improvement = SelfImprovement(self.memory)
        self.emergency = emergency_stop or EmergencyStop()

        self._started = False

    # ── Lifecycle ───────────────────────────────────────────────────────
    def start(self) -> dict[str, Any]:
        """Start all MCP servers and prepare the infrastructure."""
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

    # ── Session management (multi-agent isolation) ─────────────────────
    def create_session(
        self,
        agent_type: str = "arena_agent",
        provider: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Create a new isolated agent session. Returns session_id."""
        session = session_manager.create_session(
            agent_type=agent_type, provider=provider, metadata=metadata
        )
        return session.session_id

    def get_session(self, session_id: str):
        return session_manager.get_session(session_id)

    def list_sessions(self) -> list[dict[str, Any]]:
        return session_manager.list_sessions()

    def close_session(self, session_id: str) -> bool:
        return session_manager.close_session(session_id)

    # ── Resource locking (prevent conflicting PC operations) ───────────
    def acquire_resource(self, resource_id: str, session_id: str, timeout: float = 10.0) -> bool:
        return session_manager.acquire_resource(resource_id, session_id, timeout=timeout)

    def release_resource(self, resource_id: str, session_id: str) -> bool:
        return session_manager.release_resource(resource_id, session_id)

    def release_all_resources_for_session(self, session_id: str) -> list[str]:
        return session_manager.release_all_resources_for_session(session_id)

    # ── Tool routing ───────────────────────────────────────────────────
    def list_tools(self, refresh: bool = False) -> list[dict[str, Any]]:
        return self.router.list_tools(refresh=refresh)

    def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        """Route a tool call to the appropriate MCP server."""
        return self.router.call_tool(tool_name, arguments or {}, timeout=timeout)

    def server_statuses(self) -> list[dict[str, Any]]:
        return self.router.server_statuses()

    # ── Security ───────────────────────────────────────────────────────
    def evaluate_policy(self, tool_name: str, arguments: dict[str, Any] | None):
        """Evaluate a tool call against the PolicyEngine (ALLOW/CONFIRM/DENY)."""
        return self.policy.evaluate_tool(tool_name, arguments)

    def emergency_activate(self, reason: str = "user_requested") -> None:
        self.emergency.activate(reason)

    def emergency_reset(self, authorized_by: str = "user") -> None:
        self.emergency.reset(authorized_by)

    def is_emergency_stopped(self) -> bool:
        return self.emergency.is_stopped

    # ── Memory (session context persistence) ───────────────────────────
    def save_memory(self, project: str, key: str, value: str, category: str = "fact"):
        return self.memory.save_user_preference(key, value) if project == "global" else self.memory.base.save(project, key, value, category)

    def recall_memory(self, project: str = "global", query: str | None = None, limit: int = 30):
        return self.memory.recall_context(project=project, query=query, limit=limit)

    def list_projects(self) -> list[dict[str, Any]]:
        return self.memory.base.list_projects()

    def save_workflow(self, name: str, steps: list[dict[str, Any]], description: str = ""):
        return self.memory.save_workflow(name, steps, description)

    def list_workflows(self) -> list[dict[str, Any]]:
        return self.memory.list_workflows()

    # ── Status ─────────────────────────────────────────────────────────
    def get_status(self) -> dict[str, Any]:
        return {
            "started": self._started,
            "emergency_stopped": self.emergency.is_stopped,
            "servers": self.router.server_statuses() if self._started else [],
            "sessions": session_manager.list_sessions(),
        }


def build_orchestrator_from_config(config_path: str | None = None) -> ArenaPCOrchestrator:
    """Factory: build an ArenaPCOrchestrator from the standard config file."""
    import json

    root = Path(__file__).resolve().parent.parent
    cfg_path = Path(config_path) if config_path else (root / "config.default.json")
    with open(cfg_path, "r", encoding="utf-8") as fh:
        config = json.load(fh)
    return ArenaPCOrchestrator(config=config, base_dir=str(root))
