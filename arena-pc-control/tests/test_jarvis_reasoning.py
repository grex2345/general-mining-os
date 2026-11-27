"""Tests for JARVIS IntentAnalyzer and SituationalAwareness."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.reasoning import IntentAnalyzer, SituationalAwareness  # noqa: E402


def test_intent_analysis_web_research() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Search YouTube for MCP tutorial videos and read the results page")
    assert intent.intent_type == "web_research"
    assert intent.requires_browser is True
    assert intent.confidence > 0.0
    assert len(intent.key_entities) >= 0


def test_intent_analysis_file_management() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Create a project folder and write a README file in ~/Documents")
    assert intent.intent_type == "file_management"
    assert intent.requires_filesystem is True
    assert intent.destructive_risk is False


def test_intent_analysis_destructive_risk() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Delete all temporary files and wipe the downloads folder")
    assert intent.destructive_risk is True


def test_intent_analysis_shell_development() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("Run a PowerShell command to check git status and then build the project")
    assert intent.intent_type in ("development", "system_admin")
    assert intent.requires_shell is True


def test_intent_unknown_input() -> None:
    analyzer = IntentAnalyzer()
    intent = analyzer.analyze("blah blah random nonsense xyz")
    assert intent.intent_type == "unknown"


def test_situational_awareness_update() -> None:
    sa = SituationalAwareness()
    sa.update_from_app_list([{"Id": 1, "ProcessName": "notepad", "MainWindowTitle": "Untitled - Notepad"}])
    summary = sa.get_context_summary()
    assert "Untitled - Notepad" in summary
    assert sa.state.focused_window is not None


def test_situational_awareness_tool_result() -> None:
    sa = SituationalAwareness()
    sa.update_from_tool_result("open_url", {"ok": True, "url": "https://youtube.com"})
    assert sa.state.active_browser is True


def test_should_retry_transient_errors() -> None:
    sa = SituationalAwareness()
    assert sa.should_retry("web_fetch_readable", "Request timed out") is True
    assert sa.should_retry("fs_delete", "Access denied") is False
    assert sa.should_retry("shell_exec", "POLICY BLOCKED") is False
