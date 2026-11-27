"""JARVIS CLI — Test and operate the autonomous assistant from the terminal.

Usage:
    python -m jarvis_core.cli --objective "Build a YouTube video pipeline"
    python -m jarvis_core.cli --status
    python -m jarvis_core.cli --emergency-stop
    python -m jarvis_core.cli --emergency-reset
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .orchestrator import build_jarvis_from_config, JarvisOrchestrator


def _print_result(result: dict) -> None:
    print("\n" + "=" * 68)
    print("  JARVIS — AUTONOMOUS EXECUTION RESULT")
    print("=" * 68)
    print(f"Objective : {result['objective']}")
    print(f"Project   : {result['project']}")
    print(f"Intent    : {result['intent']['type']} (confidence {result['intent']['confidence']:.0%})")
    print(f"Situation : {result['situation']}")
    print(f"Plan      : {result['plan']['steps']} steps — {result['plan']['rationale'][:120]}")
    if result["plan"]["requires_confirmation"]:
        print("⚠️  Plan requires user confirmation for some steps.")
    r = result["result"]
    print(f"Status    : {'✅ SUCCESS' if r['success'] else '❌ NEEDS ATTENTION'}")
    print(f"Steps     : {r['steps_completed']} / {r['total_steps']} completed")
    print(f"Summary   : {r['summary']}")
    if r["errors"]:
        print("Errors    :")
        for e in r["errors"]:
            print(f"   - {e}")
    print(f"Memory    : {result['memory']['past_errors_count']} past errors, {result['memory']['past_tasks_count']} past tasks")
    print("=" * 68 + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="JARVIS — Arena PC Control Autonomous Assistant")
    parser.add_argument("--objective", type=str, help="High-level objective for JARVIS to execute")
    parser.add_argument("--project", type=str, default="global", help="Project context (default: global)")
    parser.add_argument("--status", action="store_true", help="Show JARVIS and bridge status")
    parser.add_argument("--emergency-stop", action="store_true", help="Activate emergency stop")
    parser.add_argument("--emergency-reset", action="store_true", help="Reset emergency stop (user authorized)")
    parser.add_argument("--config", type=str, default=None, help="Path to config JSON")
    args = parser.parse_args(argv)

    jarvis = build_jarvis_from_config(args.config)

    if args.emergency_stop:
        jarvis.emergency_activate(reason="cli_requested")
        print("🛑 JARVIS EMERGENCY STOP activated. All autonomous execution halted.")
        return 0

    if args.emergency_reset:
        jarvis.emergency_reset(authorized_by="cli_user")
        print("✅ JARVIS emergency stop reset. Autonomous execution is allowed again.")
        return 0

    if args.status:
        statuses = jarvis.router.server_statuses() if jarvis._started else jarvis.start()
        print(json.dumps({"jarvis_version": "0.2.0-jarvis", "emergency_stopped": jarvis.is_emergency_stopped(), "servers": statuses}, indent=2))
        return 0

    if not args.objective:
        parser.print_help()
        return 1

    try:
        jarvis.start()
        result = jarvis.execute_objective(args.objective, project=args.project)
        _print_result(result)
        return 0 if result["result"]["success"] else 2
    finally:
        jarvis.stop()


if __name__ == "__main__":
    raise SystemExit(main())
