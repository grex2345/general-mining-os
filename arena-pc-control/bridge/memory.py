"""Persistent cross-session & multi-project memory backed by SQLite.

Stores durable facts, project paths, user preferences, and verified task state
locally on the user's PC (default: ~/.arena-pc-control/memory.db) so context
survives across Arena chat sessions and restarts.
"""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import threading
import time
from typing import Any


DEFAULT_MEMORY_DIR = Path.home() / ".arena-pc-control"


class MemoryStore:
    """Thread-safe SQLite key-value & searchable fact store scoped by project."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        if db_path is None:
            DEFAULT_MEMORY_DIR.mkdir(parents=True, exist_ok=True)
            db_path = DEFAULT_MEMORY_DIR / "memory.db"
        self.db_path = Path(os.path.expanduser(str(db_path)))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    project TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'fact',
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (project, key)
                );
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_memories_project_updated
                ON memories (project, updated_at DESC);
                """
            )
            conn.commit()

    def save(
        self,
        project: str,
        key: str,
        value: str,
        category: str = "fact",
    ) -> dict[str, Any]:
        proj = (project or "global").strip() or "global"
        k = (key or "").strip()
        if not k:
            raise ValueError("Memory 'key' cannot be empty.")
        val = str(value or "").strip()
        cat = (category or "fact").strip() or "fact"
        now = time.time()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO memories (project, key, value, category, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(project, key) DO UPDATE SET
                    value = excluded.value,
                    category = excluded.category,
                    updated_at = excluded.updated_at;
                """,
                (proj, k, val, cat, now),
            )
            conn.commit()
        return {
            "project": proj,
            "key": k,
            "value": val,
            "category": cat,
            "updated_at": now,
        }

    def recall(
        self,
        project: str | None = None,
        query: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 50), 200))
        clauses: list[str] = []
        params: list[Any] = []
        if project and project.strip() and project.strip() != "*":
            # Include both the target project and 'global' preferences unless exact match requested
            proj = project.strip()
            if proj == "global":
                clauses.append("project = ?")
                params.append("global")
            else:
                clauses.append("project IN (?, 'global')")
                params.append(proj)
        if query and query.strip():
            q = f"%{query.strip()}%"
            clauses.append("(key LIKE ? OR value LIKE ? OR category LIKE ?)")
            params.extend([q, q, q])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT project, key, value, category, updated_at
            FROM memories
            {where_sql}
            ORDER BY updated_at DESC
            LIMIT ?;
        """
        params.append(lim)
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def delete(self, project: str, key: str) -> bool:
        proj = (project or "global").strip() or "global"
        k = (key or "").strip()
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM memories WHERE project = ? AND key = ?;",
                (proj, k),
            )
            conn.commit()
            return cur.rowcount > 0

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                """
                SELECT project, COUNT(*) AS entry_count, MAX(updated_at) AS last_updated
                FROM memories
                GROUP BY project
                ORDER BY last_updated DESC;
                """
            ).fetchall()
        return [dict(r) for r in rows]
