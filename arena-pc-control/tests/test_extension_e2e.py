"""Drive the real extension (Node/jsdom) against the real Python Bridge.

Runs tests/test_extension_e2e.mjs with a live BridgeServer on a free port and
exports the port, pairing token and a temp work dir through env vars.

Usage:
    python tests/test_extension_e2e.py            # from arena-pc-control/
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.server import BridgeServer  # noqa: E402

TOKEN = "arena_extension_e2e_token_0123456789abcdef"


def _node_available() -> bool:
    return shutil.which("node") is not None


def _deps_available() -> bool:
    return (ROOT / ".testdeps" / "node_modules" / "jsdom").exists()


async def _run(tmp_path: Path) -> int:
    work = tmp_path / "work"
    work.mkdir()
    cfg = {
        "bridge": {
            "host": "127.0.0.1",
            "port": 0,
            "approvalTimeoutSeconds": 20,
            "refuseAdminStartup": False,
            "serverMonitorIntervalSeconds": 60,
        },
        "policy": {
            "allowedWriteRoots": [str(work)],
            "requireConfirmForOutsideRoots": True,
            "requireConfirmForShell": True,
            "allowReadOnlyShellWithoutConfirm": False,
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
    bridge = BridgeServer(cfg, base_dir=ROOT, state_dir=tmp_path / "state", auth_token=TOKEN)
    statuses = await bridge.start()
    print(f"[e2e] bridge status: {json.dumps(statuses)}", flush=True)
    env = dict(os.environ)
    env.update(
        {
            "APC_TEST_BRIDGE_PORT": str(bridge.port),
            "APC_TEST_BRIDGE_TOKEN": TOKEN,
            "APC_TEST_WORKDIR": str(work),
        }
    )
    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            "--test",
            # The harness opens real sockets and jsdom timers that outlive the
            # assertions; force the runner to exit once the tests are done.
            "--test-force-exit",
            str(ROOT / "tests" / "test_extension_e2e.mjs"),
            str(ROOT / "tests" / "test_extension_popup.mjs"),
            cwd=str(ROOT),
            env=env,
        )
        return await proc.wait()
    finally:
        await bridge.stop()


def main() -> int:
    if not _node_available():
        print("SKIP: node is not installed.")
        return 0
    if not _deps_available():
        print(
            "SKIP: extension test dependencies missing.\n"
            "      Run: cd arena-pc-control/.testdeps && npm install"
        )
        return 0
    with tempfile.TemporaryDirectory() as td:
        return asyncio.run(_run(Path(td)))


if __name__ == "__main__":
    sys.exit(main())
