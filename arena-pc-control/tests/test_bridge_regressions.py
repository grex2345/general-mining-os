"""Regression tests for bugs found while repairing the Arena ↔ Bridge link.

Each test pins one concrete defect that broke the real chain:

1. Two Arena tabs (one background socket, two bridge sessions) must keep their
   tool calls bound to the session they name — not the most recently created.
2. Closing one session must not detach the socket or destroy its other sessions.
3. An unauthenticated socket that disappears must not raise (it used to crash
   the handler with AttributeError).
4. A second bridge on the same state dir must refuse to start (it used to fight
   over the port and silently rotate the pairing token).
5. Startup failures (port in use) must exit with a readable message, not a
   traceback.
6. Sockets that stop answering pings must be reaped instead of leaking sessions.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import socket
import sys

import pytest
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.server import BridgeServer  # noqa: E402

TOKEN = "arena_regression_token_0123456789abcdef"


def _cfg(tmp_path: Path, **bridge_overrides) -> dict:
    bridge = {
        "host": "127.0.0.1",
        "port": 0,
        "approvalTimeoutSeconds": 5,
        "refuseAdminStartup": False,
        "serverMonitorIntervalSeconds": 60,
    }
    bridge.update(bridge_overrides)
    return {
        "bridge": bridge,
        "policy": {
            "allowedWriteRoots": [str(tmp_path)],
            "requireConfirmForOutsideRoots": True,
            "requireConfirmForShell": True,
            "allowReadOnlyShellWithoutConfirm": True,
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


async def _recv(ws, timeout: float = 10.0) -> dict:
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))


@pytest.mark.asyncio
async def test_two_sessions_on_one_socket_stay_isolated(tmp_path: Path) -> None:
    """One extension socket serving two Arena tabs must not cross sessions."""
    bridge = BridgeServer(
        _cfg(tmp_path), base_dir=ROOT, state_dir=tmp_path / "state", auth_token=TOKEN
    )
    await bridge.start()
    try:
        async with connect(f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://tabtest") as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": TOKEN}))
            auth = await _recv(ws)
            session_a = auth["session_id"]

            await ws.send(json.dumps({"id": 2, "type": "create_session", "provider": "arena"}))
            created = await _recv(ws)
            session_b = created["session_id"]
            assert session_b != session_a

            # Tab B calls a tool naming session B (not the active session A).
            await ws.send(
                json.dumps(
                    {
                        "id": 3,
                        "type": "call_tool",
                        "tool": "system_info",
                        "arguments": {},
                        "session_id": session_b,
                        "correlation_id": "b-1",
                    }
                )
            )
            res_b = await _recv(ws)
            assert res_b["type"] == "tool_result"
            assert res_b["ok"] is True
            assert res_b["session_id"] == session_b, (
                "tool result must be attributed to the session the caller named"
            )

            # Tab A calls a tool naming session A.
            await ws.send(
                json.dumps(
                    {
                        "id": 4,
                        "type": "call_tool",
                        "tool": "system_info",
                        "arguments": {},
                        "session_id": session_a,
                        "correlation_id": "a-1",
                    }
                )
            )
            res_a = await _recv(ws)
            assert res_a["session_id"] == session_a

            # A foreign session id must not be honoured.
            await ws.send(
                json.dumps(
                    {
                        "id": 5,
                        "type": "call_tool",
                        "tool": "system_info",
                        "arguments": {},
                        "session_id": "deadbeefdeadbeef",
                    }
                )
            )
            res_foreign = await _recv(ws)
            assert res_foreign["session_id"] != "deadbeefdeadbeef"
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_closing_one_session_keeps_socket_and_other_sessions(tmp_path: Path) -> None:
    bridge = BridgeServer(
        _cfg(tmp_path), base_dir=ROOT, state_dir=tmp_path / "state2", auth_token=TOKEN
    )
    await bridge.start()
    try:
        async with connect(f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://closetest") as ws:
            await ws.send(json.dumps({"id": 1, "type": "auth", "token": TOKEN}))
            primary = (await _recv(ws))["session_id"]
            await ws.send(json.dumps({"id": 2, "type": "create_session"}))
            secondary = (await _recv(ws))["session_id"]

            # Close the secondary session (the "active" one).
            await ws.send(json.dumps({"id": 3, "type": "close_session", "session_id": secondary}))
            closed = await _recv(ws)
            assert closed["type"] == "session_closed"

            await ws.send(json.dumps({"id": 4, "type": "list_sessions"}))
            sessions = await _recv(ws)
            ids = {s["session_id"] for s in sessions["sessions"]}
            assert secondary not in ids
            assert primary in ids, "closing one session must not close the others"

            # And the socket is still usable for the remaining session.
            await ws.send(
                json.dumps(
                    {
                        "id": 5,
                        "type": "call_tool",
                        "tool": "system_info",
                        "arguments": {},
                        "session_id": primary,
                    }
                )
            )
            res = await _recv(ws)
            assert res["ok"] is True
            assert res["session_id"] == primary

            # Closing someone else's session is rejected.
            await ws.send(json.dumps({"id": 6, "type": "close_session", "session_id": "notmine123"}))
            denied = await _recv(ws)
            assert denied["type"] == "error"
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_abrupt_disconnect_without_auth_is_clean(tmp_path: Path) -> None:
    """A tab that connects and vanishes must not produce an unhandled error."""
    bridge = BridgeServer(
        _cfg(tmp_path), base_dir=ROOT, state_dir=tmp_path / "state3", auth_token=TOKEN
    )
    await bridge.start()
    try:
        ws = await connect(f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://abrupt")
        await ws.close()  # close immediately, never authenticate
        await asyncio.sleep(0.2)
        assert bridge._authed_clients == {}
        assert bridge._ws_sessions == {}
        # Bridge still serves other clients.
        async with connect(f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://after") as ws2:
            await ws2.send(json.dumps({"id": 1, "type": "ping"}))
            pong = await _recv(ws2)
            assert pong["type"] == "pong"
    finally:
        await bridge.stop()


@pytest.mark.asyncio
async def test_second_bridge_on_same_state_dir_is_refused(tmp_path: Path) -> None:
    state = tmp_path / "shared_state"
    first = BridgeServer(_cfg(tmp_path), base_dir=ROOT, state_dir=state, auth_token=TOKEN)
    await first.start()
    second = BridgeServer(_cfg(tmp_path), base_dir=ROOT, state_dir=state, auth_token=TOKEN)
    try:
        with pytest.raises(RuntimeError, match="already running"):
            await second.start()
    finally:
        await second.stop()
        await first.stop()

    # The lock is released on stop, so a restart works.
    third = BridgeServer(_cfg(tmp_path), base_dir=ROOT, state_dir=state, auth_token=TOKEN)
    try:
        await third.start()
    finally:
        await third.stop()


def test_port_in_use_exits_cleanly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """`python bridge/server.py` on a busy port prints an error, not a traceback."""
    import subprocess

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    port = sock.getsockname()[1]
    cfg_file = tmp_path / "cfg.json"
    cfg_file.write_text(json.dumps(_cfg(tmp_path, port=port)), encoding="utf-8")
    try:
        proc = subprocess.run(
            [sys.executable, str(ROOT / "bridge" / "server.py"), "--config", str(cfg_file)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(ROOT),
            env={"PATH": "/usr/bin:/bin", "HOME": str(tmp_path / "home"), "PYTHONPATH": str(ROOT)},
        )
    finally:
        sock.close()

    combined = proc.stdout + proc.stderr
    assert proc.returncode != 0
    assert "Traceback" not in combined, f"startup must not dump a traceback:\n{combined}"
    assert "could not start" in combined.lower() or "address already in use" in combined.lower()
    del capsys


@pytest.mark.asyncio
async def test_vanished_tab_session_is_reaped(tmp_path: Path) -> None:
    """A tab that disappears without close_session must not leak its session.

    Tab crashes, extension reloads and half-open sockets never send
    close_session. Without the idle reaper the session registry (and the
    resource locks it holds) grows forever.
    """
    bridge = BridgeServer(
        _cfg(
            tmp_path,
            serverMonitorIntervalSeconds=0.2,
            sessionIdleTimeoutSeconds=0.5,
        ),
        base_dir=ROOT,
        state_dir=tmp_path / "state5",
        auth_token=TOKEN,
    )
    await bridge.start()
    try:
        ws = await connect(f"ws://127.0.0.1:{bridge.port}", origin="chrome-extension://frozen")
        await ws.send(json.dumps({"id": 1, "type": "auth", "token": TOKEN}))
        session_id = (await _recv(ws))["session_id"]
        assert session_id in bridge._session_owners

        # Stay connected (like a frozen/suspended tab) but never touch the
        # session again; it must be reaped by the monitor.
        deadline = asyncio.get_running_loop().time() + 10
        while asyncio.get_running_loop().time() < deadline:
            if session_id not in bridge._session_owners:
                break
            await asyncio.sleep(0.1)

        assert session_id not in bridge._session_owners, (
            "an idle session must be released even if its socket stays open"
        )
        assert session_id not in {s["session_id"] for s in _list_sessions(bridge)}
        await ws.close()
    finally:
        await bridge.stop()


def _list_sessions(bridge: BridgeServer) -> list[dict]:
    from bridge.session_manager import session_manager

    return session_manager.list_sessions()
