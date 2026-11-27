"""Session Manager — Session isolation, correlation IDs, and resource locking.

Provides multi-agent session support for the shared local Bridge:

  * Each agent (independent JARVIS or external Arena agent) gets its own session
  * Session contexts are isolated — no mixing of private context or tool responses
  * Correlation IDs track tool-call request/response pairs within a session
  * Resource locking prevents conflicting PC operations across concurrent agents
  * Session ownership and lifecycle management
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentSession:
    """Represents an active agent session connected to the Bridge."""

    session_id: str
    agent_type: str  # 'jarvis_independent' | 'arena_agent' | 'external_mcp'
    provider: str | None = None  # Arena agent provider name if applicable
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)
    active: bool = True

    def touch(self) -> None:
        self.last_activity = time.time()

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "agent_type": self.agent_type,
            "provider": self.provider,
            "created_at": self.created_at,
            "last_activity": self.last_activity,
            "metadata": self.metadata,
            "active": self.active,
        }


class SessionManager:
    """Thread-safe session registry with resource locking."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, AgentSession] = {}
        self._session_locks: dict[str, threading.Lock] = {}
        self._resource_locks: dict[str, str] = {}  # resource_id -> session_id holding lock
        self._resource_lock_lock = threading.Lock()

    # ── Session lifecycle ──────────────────────────────────────────────
    def create_session(
        self,
        agent_type: str = "arena_agent",
        provider: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentSession:
        session_id = uuid.uuid4().hex[:16]
        session = AgentSession(
            session_id=session_id,
            agent_type=agent_type,
            provider=provider,
            metadata=metadata or {},
        )
        with self._lock:
            self._sessions[session_id] = session
            self._session_locks[session_id] = threading.Lock()
        return session

    def get_session(self, session_id: str) -> AgentSession | None:
        with self._lock:
            session = self._sessions.get(session_id)
        if session:
            session.touch()
        return session

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            return [s.to_dict() for s in self._sessions.values()]

    def close_session(self, session_id: str) -> bool:
        with self._lock:
            session = self._sessions.pop(session_id, None)
            self._session_locks.pop(session_id, None)
        if session:
            session.active = False
            # Release any resource locks held by this session
            self.release_all_resources_for_session(session_id)
            return True
        return False

    def session_lock(self, session_id: str) -> threading.Lock:
        with self._lock:
            return self._session_locks.get(session_id, threading.Lock())

    # ── Resource locking ───────────────────────────────────────────────
    def acquire_resource(self, resource_id: str, session_id: str, timeout: float = 10.0) -> bool:
        """Attempt to acquire a resource lock for a session. Returns True if acquired."""
        start = time.time()
        while time.time() - start < timeout:
            with self._resource_lock_lock:
                holder = self._resource_locks.get(resource_id)
                if holder is None:
                    self._resource_locks[resource_id] = session_id
                    return True
                if holder == session_id:
                    return True  # Already held by this session
            time.sleep(0.1)
        return False

    def release_resource(self, resource_id: str, session_id: str) -> bool:
        """Release a resource lock if held by the given session."""
        with self._resource_lock_lock:
            holder = self._resource_locks.get(resource_id)
            if holder == session_id:
                del self._resource_locks[resource_id]
                return True
            return False

    def release_all_resources_for_session(self, session_id: str) -> list[str]:
        """Release all resources held by a session (e.g., on session close)."""
        released: list[str] = []
        with self._resource_lock_lock:
            for resource_id, holder in list(self._resource_locks.items()):
                if holder == session_id:
                    del self._resource_locks[resource_id]
                    released.append(resource_id)
        return released

    def resource_holder(self, resource_id: str) -> str | None:
        with self._resource_lock_lock:
            return self._resource_locks.get(resource_id)

    # ── Correlation ID tracking ────────────────────────────────────────
    def new_correlation_id(self, session_id: str) -> str:
        """Generate a new correlation ID for a tool-call within a session."""
        return f"{session_id}:{uuid.uuid4().hex[:8]}"


# Global singleton instance
session_manager = SessionManager()
