"""Tests for JARVIS SelfImprovement learning system."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.memory_extended import JarvisMemory  # noqa: E402
from jarvis_core.self_improvement import SelfImprovement  # noqa: E402


def test_record_and_suggest_fix(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    imp = SelfImprovement(mem)

    # Record a failure first
    imp.record_failure(
        tool="fs_edit",
        arguments={"path": "x.txt", "old_text": "abc", "new_text": "def"},
        error="old_text was not found in the file.",
        context="Editing config",
        recovered=False,
    )

    # Now suggest a fix for a similar error
    suggestion = imp.suggest_fix("fs_edit", "old_text was not found in the file.")
    assert suggestion is not None
    assert "fs_read" in suggestion["recovery_note"]


def test_record_success(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    imp = SelfImprovement(mem)
    imp.record_success(
        tool="system_info",
        arguments={},
        result_text="{\"ok\": true, \"os\": \"Linux\"}",
    )
    # Should not raise and should store a success pattern
    patterns = mem.recall_context("global", "success_pattern", limit=10)
    assert len(patterns) >= 1


def test_suggest_fix_no_match(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    imp = SelfImprovement(mem)
    # No prior patterns — should return None or heuristic
    suggestion = imp.suggest_fix("unknown_tool", "some weird error")
    # May return None or a heuristic; just ensure it doesn't crash
    assert suggestion is None or isinstance(suggestion, dict)


def test_find_reusable_workflow(tmp_path: Path) -> None:
    mem = JarvisMemory(tmp_path / "mem.db")
    imp = SelfImprovement(mem)
    mem.save_workflow("youtube_pipeline", [], "Build a YouTube video production pipeline")
    wf = imp.find_reusable_workflow(["youtube", "pipeline"])
    assert wf is not None
    assert wf["name"] == "youtube_pipeline"
