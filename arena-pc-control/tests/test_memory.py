"""Tests for SQLite cross-session & multi-project MemoryStore."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.memory import MemoryStore  # noqa: E402


def test_memory_persists_across_sessions_and_updates_cleanly(tmp_path: Path) -> None:
    db_file = tmp_path / "memory.db"

    # Session 1
    store1 = MemoryStore(db_file)
    store1.save("global", "preferred_browser", "Microsoft Edge", category="preference")
    store1.save("video_workflow", "export_dir", "D:/Renders", category="path")
    store1.save("video_workflow", "export_dir", "E:/FinalRenders", category="path")  # update

    # Session 2 (brand new instance reading same SQLite file)
    store2 = MemoryStore(db_file)
    recalled = store2.recall(project="video_workflow")
    by_key = {item["key"]: item["value"] for item in recalled}

    assert by_key["export_dir"] == "E:/FinalRenders"
    assert by_key["preferred_browser"] == "Microsoft Edge"

    # Search filter
    filtered = store2.recall(project="*", query="Edge")
    assert len(filtered) == 1
    assert filtered[0]["key"] == "preferred_browser"

    # Project listing & deletion
    projects = {p["project"]: p["entry_count"] for p in store2.list_projects()}
    assert projects == {"global": 1, "video_workflow": 1}

    assert store2.delete("video_workflow", "export_dir") is True
    assert store2.delete("video_workflow", "export_dir") is False
