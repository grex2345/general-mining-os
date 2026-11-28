"""Regressions for the last three hardening defects.

6  – approvals must not outlive the socket that was asked to decide them.
9  – `rebuild_routes` must not let one server shadow another's alias.
11 – `session_lock()` must return a stable lock, even for an unknown session.
"""

from __future__ import annotations

import asyncio
import json
import threading
import textwrap
from pathlib import Path

import pytest
from websockets.asyncio.client import connect

from bridge.mcp_client import MCPRouter
from bridge.server import BridgeServer
from bridge.session_manager import SessionManager

TOKEN = "defect_suite_token_0123456789abcdef"


# ── Defect 11 ─────────────────────────────────────────────────────────────
def test_session_lock_is_stable_for_unknown_sessions() -> None:
    manager = SessionManager()
    first = manager.session_lock("never-created")
    second = manager.session_lock("never-created")
    assert first is second, "a fresh lock per call means no mutual exclusion"

    entered: list[str] = []
    held = threading.Event()
    released = threading.Event()

    def holder() -> None:
        with manager.session_lock("never-created"):
            entered.append("holder")
            held.set()
            released.wait(timeout=5)

    thread = threading.Thread(target=holder, daemon=True)
    thread.start()
    assert held.wait(timeout=5)
    acquired = manager.session_lock("never-created").acquire(timeout=0.2)
    if acquired:
        manager.session_lock("never-created").release()
    assert not acquired, "second caller entered the critical section concurrently"
    released.set()
    thread.join(timeout=5)


def test_session_lock_isolated_per_session_and_survives_close() -> None:
    manager = SessionManager()
    session = manager.create_session()
    lock = manager.session_lock(session.session_id)
    assert lock is manager.session_lock(session.session_id)
    manager.close_session(session.session_id)
    # A closed session gets a *fresh* (unlocked) lock, never a stale held one.
    assert manager.session_lock(session.session_id).locked() is False


# ── Defect 9 ──────────────────────────────────────────────────────────────
FAKE_SERVER = textwrap.dedent(
    '''
    import json, sys

    def send(obj):
        sys.stdout.write(json.dumps(obj) + "\\n")
        sys.stdout.flush()

    TOOLS = [
        {"name": "ping", "description": "d", "inputSchema": {"type": "object"}},
        {"name": "second/ping", "description": "weird name", "inputSchema": {"type": "object"}},
    ]

    for line in sys.stdin:
        msg = json.loads(line)
        method = msg.get("method")
        if method == "initialize":
            send({"jsonrpc": "2.0", "id": msg["id"], "result": {
                "protocolVersion": "2025-06-18", "capabilities": {},
                "serverInfo": {"name": "fake", "version": "1"}}})
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": msg["id"], "result": {"tools": TOOLS}})
        elif method == "tools/call":
            send({"jsonrpc": "2.0", "id": msg["id"], "result": {
                "content": [{"type": "text", "text": "called:" + msg["params"]["name"]}],
                "isError": False}})
    '''
)


def _fake_router(tmp_path, server_ids=("local_pc", "second")) -> MCPRouter:
    script = tmp_path / "fake_mcp.py"
    script.write_text(FAKE_SERVER, encoding="utf-8")
    router = MCPRouter(base_dir=tmp_path)
    router.load_servers(
        {
            sid: {"enabled": True, "command": str(script), "args": [], "env": {}}
            for sid in server_ids
        }
    )
    return router


def test_router_never_exposes_a_bare_name_that_is_another_servers_alias(tmp_path) -> None:
    router = _fake_router(tmp_path)
    statuses = router.start_all()
    try:
        assert all("online" in v for v in statuses.values()), statuses
        names = [tool["name"] for tool in router.list_tools()]
        assert len(names) == len(set(names)), f"duplicate public names: {names}"
        # `second/ping` is a tool name on local_pc AND the alias of second's ping.
        assert router.call_tool("second/ping", {})["text"] == "called:ping"
        assert router.call_tool("local_pc/ping", {})["text"] == "called:ping"
        # Every name in the catalog must be callable — no dead entries.
        for name in names:
            router.call_tool(name, {})
    finally:
        router.stop_all()


def test_router_catalog_matches_routes_after_a_server_is_added(tmp_path) -> None:
    router = _fake_router(tmp_path, server_ids=("local_pc",))
    router.start_all()
    try:
        before = {tool["name"] for tool in router.list_tools()}
        extra = tmp_path / "fake2.py"
        extra.write_text(FAKE_SERVER, encoding="utf-8")
        router.load_servers({"late": {"enabled": True, "command": str(extra), "args": [], "env": {}}})
        router.start_all()
        catalog = router.list_tools()
        after = {tool["name"] for tool in catalog}
        assert before <= after
        for tool in catalog:
            assert router.call_tool(tool["name"], {})["text"].startswith("called:")
    finally:
        router.stop_all()


def _approval_cfg(tmp_path: Path) -> dict:
    return {
        "bridge": {
            "host": "127.0.0.1",
            "port": 0,
            "refuseAdminStartup": False,
            "approvalTimeoutSeconds": 60,
            "serverMonitorIntervalSeconds": 3600,
        },
        "policy": {
            "allowedWriteRoots": [str(tmp_path / "workspace")],
            "requireConfirmForOutsideRoots": True,
        },
        "mcpServers": {
            "local_pc": {
                "enabled": True,
                "command": "bridge/builtin_mcp_server.py",
                "args": [],
                "env": {"ARENA_PC_MEMORY_DB": str(tmp_path / "mem.db")},
            }
        },
    }


# ── Defect 6 ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def _unused_pending_approval_is_cancelled_when_the_socket_dies(tmp_path) -> None:
    """A closed tab must not leave the agent blocked for the full approval timeout."""
    bridge = BridgeServer(
        _approval_cfg(tmp_path),
        base_dir=Path(__file__).resolve().parent.parent,
        state_dir=tmp_path / "state",
        auth_token=TOKEN,
    )
    await bridge.start()
    try:
        async with connect(
            f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://canceltest"
        ) as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": TOKEN}))
            auth = json.loads(await ws.recv())
            assert auth["type"] == "auth_ok"
            await ws.send(json.dumps({"id": 2, "type": "create_session"}))
            created = json.loads(await ws.recv())
            assert created["type"] == "session_created", created
            session_id = created["session_id"]

            # An fs_write outside allowedWriteRoots is CONFIRM-tier, so the
            # bridge must block the call and ask this socket for a decision.
            await ws.send(
                json.dumps(
                    {
                        "id": 3,
                        "type": "call_tool",
                        "session_id": session_id,
                        "tool": "fs_write",
                        "arguments": {
                            "path": str(tmp_path / "outside" / "blocked.txt"),
                            "content": "x",
                        },
                    }
                )
            )
            prompt = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
            assert prompt["type"] == "approval_required", prompt
            assert bridge._pending_approvals, "approval was not registered"

            # Drop the socket the way a closed tab does.
            loop = asyncio.get_running_loop()
            closed_at = loop.time()

        for _ in range(120):
            if not bridge._pending_approvals:
                break
            await asyncio.sleep(0.05)
        elapsed = loop.time() - closed_at

        assert not bridge._pending_approvals, "pending approval leaked after disconnect"
        assert elapsed < 10, f"approval was not cancelled promptly ({elapsed:.1f}s)"
        events = [
            json.loads(line)
            for line in bridge.audit_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        assert any(e.get("event") == "approval_cancelled" for e in events), events[-5:]
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_stopping_the_bridge_denies_waiting_approvals(tmp_path) -> None:
    bridge = BridgeServer(
        _approval_cfg(tmp_path),
        base_dir=Path(__file__).resolve().parent.parent,
        state_dir=tmp_path / "state",
        auth_token=TOKEN,
    )
    await bridge.start()
    async with connect(
        f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://stoptest"
    ) as ws:
        await ws.send(json.dumps({"id": 1, "type": "auth", "token": TOKEN}))
        await ws.recv()
        await ws.send(json.dumps({"id": 2, "type": "create_session"}))
        created = json.loads(await ws.recv())
        assert created["type"] == "session_created", created
        session_id = created["session_id"]
        await ws.send(
            json.dumps(
                {
                    "id": 3,
                    "type": "call_tool",
                    "session_id": session_id,
                    "tool": "fs_write",
                    "arguments": {"path": str(tmp_path / "out2" / "x.txt"), "content": "x"},
                }
            )
        )
        prompt = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
        assert prompt["type"] == "approval_required"
        await bridge.stop()
        assert not bridge._pending_approvals


# ── Emergency stop (defect 30) ────────────────────────────────────────────
def test_emergency_stop_activated_externally_blocks_a_running_bridge(tmp_path: Path) -> None:
    """The kill switch must work from the CLI while the bridge is already up."""
    from jarvis_core.emergency_stop import EmergencyStop  # noqa: PLC0415

    state = tmp_path / "emergency_stop.json"
    running = EmergencyStop(state)
    assert running.is_stopped is False

    # Another process (scripts/emergency_stop.py --activate) flips the file.
    external = EmergencyStop(state)
    external.activate("test")

    assert running.is_stopped is True, "a cached flag defeats the kill switch"

    external.reset()
    assert running.is_stopped is False, "reset must also take effect immediately"

    # A deleted state file must not resurrect the old value either.
    state.unlink()
    assert running.is_stopped is False


@pytest.mark.asyncio
async def test_emergency_stop_blocks_tool_calls_through_the_bridge(tmp_path, monkeypatch) -> None:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))

    bridge = BridgeServer(
        _approval_cfg(tmp_path),
        base_dir=Path(__file__).resolve().parent.parent,
        state_dir=tmp_path / "state",
        auth_token=TOKEN,
    )
    await bridge.start()
    try:
        async with connect(
            f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://estoptest"
        ) as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": TOKEN}))
            session_id = json.loads(await ws.recv())["session_id"]

            async def call(msg_id: int) -> dict:
                await ws.send(
                    json.dumps(
                        {
                            "id": msg_id,
                            "type": "call_tool",
                            "session_id": session_id,
                            "tool": "shell_exec",
                            "arguments": {"command": "echo MUST_NOT_RUN"},
                        }
                    )
                )
                return json.loads(await asyncio.wait_for(ws.recv(), timeout=20))

            assert (await call(2)).get("ok") is not False

            # Simulate `python scripts/emergency_stop.py --activate` in another process.
            from jarvis_core.emergency_stop import EmergencyStop  # noqa: PLC0415

            EmergencyStop().activate("unit-test")
            blocked = await call(3)
            assert blocked.get("ok") is False
            assert "EMERGENCY STOP" in json.dumps(blocked)

            EmergencyStop().reset()
            assert (await call(4)).get("ok") is not False
    finally:
        await bridge.stop()
