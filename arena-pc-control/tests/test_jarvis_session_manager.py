"""Tests for JARVIS Session Manager — session isolation, correlation IDs, resource locking."""

from __future__ import annotations

from pathlib import Path
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.session_manager import session_manager, AgentSession  # noqa: E402


def test_create_and_get_session() -> None:
    # Clear existing sessions for clean test
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    session = session_manager.create_session(
        agent_type="jarvis_independent",
        provider="jarvis_core",
        metadata={"project": "test_proj"},
    )
    assert session.session_id
    assert session.agent_type == "jarvis_independent"
    assert session.provider == "jarvis_core"
    assert session.active is True

    retrieved = session_manager.get_session(session.session_id)
    assert retrieved is not None
    assert retrieved.session_id == session.session_id


def test_list_sessions() -> None:
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    session_manager.create_session(agent_type="arena_agent", provider="arena")
    session_manager.create_session(agent_type="jarvis_independent", provider="jarvis_core")

    sessions = session_manager.list_sessions()
    assert len(sessions) >= 2
    types = {s["agent_type"] for s in sessions}
    assert "arena_agent" in types
    assert "jarvis_independent" in types


def test_close_session() -> None:
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    session = session_manager.create_session(agent_type="arena_agent", provider="arena")
    sid = session.session_id

    assert session_manager.get_session(sid) is not None
    assert session_manager.close_session(sid) is True
    assert session_manager.get_session(sid) is None
    assert session_manager.close_session(sid) is False  # Already closed


def test_resource_locking_exclusive() -> None:
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    s1 = session_manager.create_session(agent_type="arena_agent", provider="arena")
    s2 = session_manager.create_session(agent_type="jarvis_independent", provider="jarvis_core")

    # Session 1 acquires resource
    assert session_manager.acquire_resource("printer", s1.session_id) is True
    # Session 2 cannot acquire same resource (exclusive)
    assert session_manager.acquire_resource("printer", s2.session_id, timeout=0.5) is False
    # Session 1 can re-acquire (already holds it)
    assert session_manager.acquire_resource("printer", s1.session_id) is True

    # Session 1 releases
    assert session_manager.release_resource("printer", s1.session_id) is True
    # Session 2 can now acquire
    assert session_manager.acquire_resource("printer", s2.session_id, timeout=1.0) is True

    # Cleanup
    session_manager.release_resource("printer", s2.session_id)


def test_release_all_resources_for_session() -> None:
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    s1 = session_manager.create_session(agent_type="arena_agent", provider="arena")
    session_manager.acquire_resource("res_a", s1.session_id)
    session_manager.acquire_resource("res_b", s1.session_id)

    released = session_manager.release_all_resources_for_session(s1.session_id)
    assert "res_a" in released
    assert "res_b" in released

    # After release, another session can acquire
    s2 = session_manager.create_session(agent_type="jarvis_independent", provider="jarvis_core")
    assert session_manager.acquire_resource("res_a", s2.session_id) is True


def test_correlation_id_generation() -> None:
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    session = session_manager.create_session(agent_type="arena_agent", provider="arena")
    cid1 = session_manager.new_correlation_id(session.session_id)
    cid2 = session_manager.new_correlation_id(session.session_id)
    assert cid1 != cid2
    assert session.session_id in cid1
    assert session.session_id in cid2


def test_session_isolation() -> None:
    """Verify that sessions are isolated — different sessions don't share state."""
    for s in list(session_manager.list_sessions()):
        session_manager.close_session(s["session_id"])

    s1 = session_manager.create_session(agent_type="arena_agent", provider="arena")
    s2 = session_manager.create_session(agent_type="jarvis_independent", provider="jarvis_core")

    assert s1.session_id != s2.session_id
    assert session_manager.get_session(s1.session_id).session_id == s1.session_id
    assert session_manager.get_session(s2.session_id).session_id == s2.session_id

    # Resource held by s1 is not accessible by s2
    session_manager.acquire_resource("isolated_res", s1.session_id)
    assert session_manager.acquire_resource("isolated_res", s2.session_id, timeout=0.3) is False

    session_manager.release_resource("isolated_res", s1.session_id)
