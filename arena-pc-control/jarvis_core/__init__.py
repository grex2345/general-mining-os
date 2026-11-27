"""Arena PC Control — JARVIS Core Orchestration Layer.

A central intelligent orchestration engine that turns Arena PC Control from a
turn-by-turn command relay into an autonomous, situation-aware assistant:

  Reasoning & Planning  ->  Memory  ->  PC Control  ->  Verification  ->  Recovery

All security boundaries of the existing bridge (loopback-only, Origin check,
PolicyEngine ALLOW/CONFIRM/DENY, audit log, emergency stop) are preserved and
enforced by this layer. Nothing here weakens security or elevates privileges.

Two operating modes:

  MODE A — Independent JARVIS: Runs locally on Windows with its own AI model,
           memory, and planning engine. Works without opening Arena.
  MODE B — External AI Agent: Arena.ai agent connects via the universal Chrome
           extension. JARVIS provides tools, execution, observations, and
           infrastructure while the external agent does the reasoning.
"""

from __future__ import annotations

from .orchestrator import JarvisOrchestrator, build_jarvis_from_config
from .planner import TaskPlanner, TaskStep, Plan
from .reasoning import IntentAnalyzer, SituationalAwareness
from .task_engine import TaskEngine, StepResult, ExecutionResult
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop
from .agent_loop import JarvisAgentLoop, AgentLoopResult, create_jarvis_agent
from .model_provider import (
    ModelProvider,
    MockProvider,
    OpenAICompatibleProvider,
    AnthropicProvider,
    LocalProvider,
    ArenaProvider,
    ModelProviderManager,
    model_provider_manager,
)
from .api_server import JarvisAPIServer, run_api_server

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
    "JarvisAgentLoop",
    "AgentLoopResult",
    "create_jarvis_agent",
    "ModelProvider",
    "MockProvider",
    "OpenAICompatibleProvider",
    "AnthropicProvider",
    "LocalProvider",
    "ArenaProvider",
    "ModelProviderManager",
    "model_provider_manager",
    "JarvisAPIServer",
    "run_api_server",
]

__version__ = "0.3.0-jarvis-universal"
