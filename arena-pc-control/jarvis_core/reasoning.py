"""Reasoning & Situational Awareness for JARVIS.

Analyzes user intent beyond literal commands and tracks the current PC state
so JARVIS can make intelligent decisions about which tools to use and when.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class IntentAnalysis:
    objective: str
    intent_type: str  # 'file_management', 'web_research', 'app_control', 'development', 'system_admin', 'mixed', 'unknown'
    confidence: float  # 0.0 - 1.0
    requires_browser: bool = False
    requires_desktop_app: bool = False
    requires_filesystem: bool = False
    requires_shell: bool = False
    requires_memory: bool = False
    destructive_risk: bool = False
    estimated_steps: int = 1
    key_entities: list[str] = field(default_factory=list)
    suggested_project: str = "global"


@dataclass
class PCState:
    """Snapshot of the current PC situation."""

    open_windows: list[dict[str, Any]] = field(default_factory=list)
    focused_window: dict[str, Any] | None = None
    active_browser: bool = False
    last_tool_results: list[dict[str, Any]] = field(default_factory=list)
    recent_errors: list[str] = field(default_factory=list)
    screen_summary: str | None = None


class IntentAnalyzer:
    """Analyzes natural-language objectives into structured intent."""

    _INTENT_KEYWORDS = {
        "file_management": [
            "file", "folder", "directory", "document", "create file", "write", "read",
            "move", "copy", "delete", "organize", "save", "backup", "project structure",
        ],
        "web_research": [
            "youtube", "search", "website", "web page", "browse", "google", "open url",
            "fetch", "read page", "online", "video", "article",
        ],
        "app_control": [
            "open app", "launch", "application", "program", "window", "focus",
            "switch to", "close app", "run", "notepad", "calculator", "code",
        ],
        "development": [
            "code", "script", "python", "javascript", "build", "compile", "git",
            "repository", "project", "deploy", "terminal", "command line",
        ],
        "system_admin": [
            "system info", "powerShell", "terminal", "command", "process", "service",
            "setting", "configuration", "diagnose",
        ],
    }

    _DESTRUCTIVE_KEYWORDS = [
        "delete", "remove", "format", "wipe", "erase", "uninstall", "kill",
        "terminate", "destroy", "reset",
    ]

    _BROWSER_KEYWORDS = ["browser", "chrome", "edge", "youtube", "website", "web", "url", "search", "page"]
    _DESKTOP_KEYWORDS = ["app", "application", "window", "desktop", "software", "program", "launch", "open"]
    _FILESYSTEM_KEYWORDS = ["file", "folder", "directory", "document", "read", "write", "save", "create"]
    _SHELL_KEYWORDS = ["command", "terminal", "powershell", "script", "run", "execute", "git"]

    def analyze(self, user_input: str, project: str | None = None) -> IntentAnalysis:
        text = (user_input or "").strip()
        low = text.lower()

        # Detect intent type by keyword scoring
        scores: dict[str, int] = {}
        for intent, keywords in self._INTENT_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in low)
            if score > 0:
                scores[intent] = score

        if not scores:
            intent_type = "unknown"
            confidence = 0.3
        else:
            intent_type = max(scores, key=scores.get)
            total = sum(scores.values())
            confidence = min(scores[intent_type] / total if total else 0.3, 1.0)
            confidence = min(confidence + 0.2, 1.0)  # boost when keywords found

        # Capability requirements
        requires_browser = any(k in low for k in self._BROWSER_KEYWORDS) or intent_type in ("web_research",)
        requires_desktop_app = any(k in low for k in self._DESKTOP_KEYWORDS) or intent_type in ("app_control",)
        requires_filesystem = any(k in low for k in self._FILESYSTEM_KEYWORDS) or intent_type in ("file_management", "development")
        requires_shell = any(k in low for k in self._SHELL_KEYWORDS) or intent_type in ("development", "system_admin")

        destructive_risk = any(k in low for k in self._DESTRUCTIVE_KEYWORDS)

        # Estimate steps based on complexity signals
        step_hints = len(re.findall(r"(then|after|and|also|first|next|finally|step)", low))
        estimated_steps = max(1, min(step_hints + 1, 12))

        # Extract key entities (quoted strings, paths, URLs)
        entities: list[str] = []
        url_matches = re.findall(r"https?://[^\s]+", text)
        entities.extend(url_matches[:5])
        path_matches = re.findall(r"[A-Za-z]:\\[^\s\"']+|/[^\s\"']+", text)
        entities.extend(path_matches[:5])
        quoted = re.findall(r'"([^"]+)"|\'([^\']+)\'', text)
        for q in quoted:
            entities.append(q[0] or q[1])
        entities = entities[:8]

        # Suggest project name from first meaningful noun
        suggested_project = project or "global"
        for kw in ["project", "build", "create", "make"]:
            if kw in low:
                # naive: take a few words after the keyword
                idx = low.find(kw)
                after = text[idx : idx + 40].strip()
                if after:
                    suggested_project = after.split()[0] if after.split() else "global"
                    break

        return IntentAnalysis(
            objective=text,
            intent_type=intent_type,
            confidence=confidence,
            requires_browser=requires_browser,
            requires_desktop_app=requires_desktop_app,
            requires_filesystem=requires_filesystem,
            requires_shell=requires_shell,
            requires_memory=True,  # JARVIS always uses memory for context
            destructive_risk=destructive_risk,
            estimated_steps=estimated_steps,
            key_entities=entities,
            suggested_project=suggested_project,
        )


class SituationalAwareness:
    """Tracks the current PC situation to inform decisions."""

    def __init__(self) -> None:
        self.state = PCState()

    def update_from_tool_result(self, tool_name: str, result: dict[str, Any]) -> None:
        """Fold a tool result into the situational state."""
        self.state.last_tool_results.append(
            {"tool": tool_name, "result": result, "ts": __import__("time").time()}
        )
        # Keep only the last 20 results
        if len(self.state.last_tool_results) > 20:
            self.state.last_tool_results = self.state.last_tool_results[-20:]

        if not result.get("ok", False):
            err_text = str(result.get("text", ""))
            self.state.recent_errors.append(f"{tool_name}: {err_text[:200]}")
            if len(self.state.recent_errors) > 10:
                self.state.recent_errors = self.state.recent_errors[-10:]

        # Detect browser state
        if tool_name in ("open_url", "browser_navigate", "web_fetch_readable"):
            self.state.active_browser = True

    def update_from_app_list(self, windows: list[dict[str, Any]]) -> None:
        self.state.open_windows = windows
        # Heuristic: focused window is first with a title
        for w in windows:
            if w.get("MainWindowTitle"):
                self.state.focused_window = w
                break

    def get_context_summary(self) -> str:
        """Human-readable summary of current situation for the planner."""
        parts: list[str] = []
        if self.state.open_windows:
            titles = [w.get("MainWindowTitle", "?") for w in self.state.open_windows[:5]]
            parts.append(f"Open windows: {', '.join(titles)}")
        if self.state.focused_window:
            parts.append(f"Focused: {self.state.focused_window.get('MainWindowTitle', '?')}")
        if self.state.active_browser:
            parts.append("Browser is active.")
        if self.state.recent_errors:
            parts.append(f"Recent errors: {'; '.join(self.state.recent_errors[-3])}")
        return " | ".join(parts) if parts else "Clean slate — no prior state."

    def should_retry(self, tool_name: str, error: str) -> bool:
        """Heuristic: should JARVIS auto-retry this tool after this error?"""
        low = error.lower()
        transient = ("timeout", "timed out", "not responding", "busy", "temporarily")
        if any(t in low for t in transient):
            return True
        # Never retry destructive or permission errors
        if any(t in low for t in ("denied", "blocked", "policy", "forbidden")):
            return False
        return False
