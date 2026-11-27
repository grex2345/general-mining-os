"""Arena PC Control — JARVIS Core Orchestration Layer.

A central intelligent orchestration engine that turns Arena PC Control from a
turn-by-turn command relay into an autonomous, situation-aware assistant:

  Reasoning & Planning  ->  Memory  ->  PC Control  ->  Verification  ->  Recovery

All security boundaries of the existing bridge (loopback-only, Origin check,
PolicyEngine ALLOW/CONFIRM/DENY, audit log, emergency stop) are preserved and
enforced by this layer. Nothing here weakens security or elevates privileges.
"""

from __future__ import annotations

from .orchestrator import JarvisOrchestrator, build_jarvis_from_config
from .planner import TaskPlanner, TaskStep, Plan
from .reasoning import IntentAnalyzer, SituationalAwareness
from .task_engine import TaskEngine, StepResult, ExecutionResult
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop

__all__ = [
    "JarvisOrchestrator",
    "build_jarvis_from_config",
    "TaskPlanner",
    "TaskStep",
    "Plan",
    "IntentAnalyzer",
    "SituationalAwareness",
    "TaskEngine",
    "StepResult",
    "ExecutionResult",
    "JarvisMemory",
    "SelfImprovement",
    "EmergencyStop",
]

__version__ = "0.2.0-jarvis"
