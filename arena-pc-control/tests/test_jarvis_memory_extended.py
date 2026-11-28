"""Tests for JARVIS JarvisMemory extended persistent memory."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.memory_extended import JarvisMemory  # noqa: E402


def test_project_architecture_roundtrip(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    arch = {
        "root": "~/Projects/youtube-pipeline",
        "folders": ["src", "assets", "output"],
        "tech_stack": ["python", "ffmpeg"],
        "entry_point": "src/main.py",
    }
    saved = mem.save_project_architecture("yt_pipeline", arch)
    assert saved["ok"] is True

    recalled = mem.recall_project_architecture("yt_pipeline")
    assert recalled is not None
    assert recalled["architecture"]["root"] == "~/Projects/youtube-pipeline"
    assert "ffmpeg" in recalled["architecture"]["tech_stack"]


def test_decision_log_roundtrip(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    mem.log_decision(
        project="proj_a",
        decision="Use Playwright for browser automation",
        rationale="Better DOM access than pixel coordinates",
        tool_used="browser_navigate",
        approved_by="user",
        outcome="pending",
    )
    decisions = mem.recall_decisions("proj_a", limit=10)
    assert len(decisions) >= 1
    assert decisions[0]["decision"] == "Use Playwright for browser automation"
    assert decisions[0]["approved_by"] == "user"


def test_task_history_roundtrip(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    mem.log_task_history(
        project="proj_b",
        objective="Organize desktop files",
        plan_summary="List then move files",
        steps_completed=3,
        total_steps=3,
        success=True,
        summary="All files organized successfully",
        errors=[],
    )
    history = mem.recall_task_history("proj_b", limit=10)
    assert len(history) >= 1
    assert history[0]["objective"] == "Organize desktop files"
    assert history[0]["success"] is True


def test_error_pattern_roundtrip(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    mem.log_error_pattern(
        project="proj_c",
        tool="fs_edit",
        error="old_text was not found in the file",
        context="Editing config.ini",
        recovery="Call fs_read first",
        worked=False,
    )
    patterns = mem.recall_error_patterns("proj_c", tool="fs_edit", limit=10)
    assert len(patterns) >= 1
    assert patterns[0]["tool"] == "fs_edit"
    assert patterns[0]["worked"] is False


def test_user_preferences(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    mem.save_user_preference("preferred_browser", "edge")
    mem.save_user_preference("confirm_threshold", "high")
    assert mem.recall_user_preference("preferred_browser") == "edge"
    assert mem.recall_user_preference("confirm_threshold") == "high"
    assert mem.recall_user_preference("nonexistent_key") is None


def test_workflow_save_and_recall(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    steps = [
        {"tool": "fs_list", "arguments": {"path": "~"}},
        {"tool": "fs_write", "arguments": {"path": "~/output.txt", "content": "done"}},
    ]
    mem.save_workflow("organize_files", steps, "List home dir then write output")
    wf = mem.recall_workflow("organize_files")
    assert wf is not None
    assert wf["name"] == "organize_files"
    assert len(wf["steps"]) == 2

    all_wfs = mem.list_workflows()
    assert len(all_wfs) >= 1


def test_memory_uses_sqlite_db(tmp_path: Path) -> None:
    db_path = tmp_path / "test_memory.db"
    mem = JarvisMemory(db_path)
    mem.save_user_preference("theme", "dark")
    assert db_path.exists()


def test_recall_context_cross_category(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    mem.log_decision("proj_d", "Use VS Code", "Preferred editor", "app_launch", "user", "ok")
    mem.log_task_history("proj_d", "Setup dev env", "Install VS Code", 1, 1, True, "Done", [])
    results = mem.recall_context("proj_d", "VS Code", limit=10)
    assert len(results) >= 1
