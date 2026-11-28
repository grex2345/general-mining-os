#!/usr/bin/env python3
"""Arena PC Control — Emergency Stop CLI.

Provides a standalone command-line interface to activate or reset the
emergency stop kill switch without requiring the deleted jarvis_core.cli.

Usage:
    python scripts/emergency_stop.py --activate
    python scripts/emergency_stop.py --reset
    python scripts/emergency_stop.py --status

The emergency stop state is persisted in ~/.arena-pc-control/emergency_stop.json
so it survives process restarts. When active, the Bridge and MCP servers
refuse all new tool executions.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.emergency_stop import EmergencyStop  # noqa: E402


def _print_bridge_state() -> None:
    """Tell the user whether a bridge is still running after the switch flips."""
    pid_file = Path.home() / ".arena-pc-control" / "bridge.pid"
    if not pid_file.exists():
        print("   (no bridge process is running)")
        return
    try:
        import os

        pid = int(pid_file.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        print(f"   bridge process {pid} is still running and now blocking tool calls.")
    except (OSError, ValueError):
        print("   (no bridge process is running)")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Arena PC Control — Emergency Stop control."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--activate",
        action="store_true",
        help="Activate emergency stop. All tool execution halts immediately.",
    )
    group.add_argument(
        "--reset",
        action="store_true",
        help="Reset emergency stop (user-authorized). Execution resumes.",
    )
    group.add_argument(
        "--status",
        action="store_true",
        help="Print current emergency stop status.",
    )
    args = parser.parse_args()

    stop_file = Path.home() / ".arena-pc-control" / "emergency_stop.json"
    es = EmergencyStop(stop_file)

    if args.status:
        print(f"Emergency stop: {'ACTIVE' if es.is_stopped else 'INACTIVE'}")
        _print_bridge_state()
        return 0

    if args.activate:
        es.activate(reason="cli_requested")
        print("🛑 EMERGENCY STOP activated. All autonomous tool execution halted.")
        print("   The running bridge refuses every tool call immediately; you do")
        print("   not need to restart it.")
        print("   Reset with: python scripts/emergency_stop.py --reset")
        _print_bridge_state()
        return 0

    if args.reset:
        es.reset(authorized_by="cli_user")
        print("✅ EMERGENCY STOP reset. Autonomous tool execution is allowed again.")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
