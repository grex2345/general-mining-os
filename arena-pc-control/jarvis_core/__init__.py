"""Arena PC Control — Infrastructure Layer (Execution Only).

This package provides execution infrastructure for the Arena-controlled workflow:

  The existing Arena AI Agent (inside Arena.ai) is the brain — it reasons,
  plans, and decides. This package provides only the execution infrastructure:
  session management, memory persistence, self-improvement learning, emergency
  stop, and bridge orchestration. It does NOT perform AI reasoning or replace
  the Arena Agent.

No OpenAI, Anthropic, Gemini, Ollama, or other AI API is required.
"""

from __future__ import annotations

from .orchestrator import ArenaPCOrchestrator, build_orchestrator_from_config
from .memory_extended import JarvisMemory
from .self_improvement import SelfImprovement
from .emergency_stop import EmergencyStop

__all__ = [
    "ArenaPCOrchestrator",
    "build_orchestrator_from_config",
    "JarvisMemory",
    "SelfImprovement",
    "EmergencyStop",
]

__version__ = "1.0.0-infrastructure"
