"""Small, dependency-free SQLite persistence layer for the MVP.

SQLite is deliberately used through the standard library so the API remains
easy to run on a single persistent VM.  Every repository method opens a short
transaction, which also makes the class straightforward to use in tests.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT 'Guest 000',
    deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    initial_statement TEXT,
    emotion TEXT,
    body_region TEXT,
    body_x REAL,
    body_y REAL,
    body_spread REAL,
    sensation TEXT,
    intensity_before INTEGER,
    intensity_after INTEGER,
    regulation_technique TEXT,
    regulation_completed INTEGER NOT NULL DEFAULT 0,
    concern TEXT,
    protective_intention TEXT,
    possible_need TEXT,
    safety_flagged INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    transcript_removed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions(profile_id, created_at);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS parts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(profile_id, name)
);
CREATE TABLE IF NOT EXISTS attributes (
    id TEXT PRIMARY KEY,
    part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attributes_part_idx ON attributes(part_id, recorded_at);
CREATE TABLE IF NOT EXISTS activations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    body_region TEXT,
    body_x REAL,
    body_y REAL,
    body_spread REAL,
    source_sensation TEXT,
    intensity_before INTEGER,
    intensity_after INTEGER,
    activated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activations_part_idx ON activations(part_id, activated_at);
CREATE TABLE IF NOT EXISTS summaries (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class Database:
    def __init__(self, path: str | Path | None = None):
        configured = path or os.getenv("SOMA_DATABASE_URL", "backend/soma.sqlite3")
        if str(configured).startswith("sqlite:///"):
            configured = str(configured)[10:]
        self.path = str(configured)
        self._lock = threading.RLock()
        self._memory_connection: sqlite3.Connection | None = None
        if self.path == ":memory:":
            self._memory_connection = sqlite3.connect(":memory:", timeout=30, check_same_thread=False)
            self._memory_connection.row_factory = sqlite3.Row
            self._memory_connection.execute("PRAGMA foreign_keys = ON")

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        if self._memory_connection is not None:
            with self._lock:
                try:
                    yield self._memory_connection
                    self._memory_connection.commit()
                except Exception:
                    self._memory_connection.rollback()
                    raise
            return
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self) -> None:
        with self.connection() as conn:
            conn.executescript(SCHEMA)
            # SQLite CREATE TABLE IF NOT EXISTS does not evolve an existing
            # database. Keep the one MVP migration here so upgrades are safe.
            profile_columns = {row["name"] for row in conn.execute("PRAGMA table_info(profiles)")}
            if "display_name" not in profile_columns:
                conn.execute("ALTER TABLE profiles ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Guest 000'")
            try:
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS activations_session_part_idx ON activations(session_id, part_id)")
            except sqlite3.IntegrityError:
                # A pre-idempotency build could have duplicate activations;
                # retain the first event and make the upgrade deterministic.
                conn.execute("DELETE FROM activations WHERE rowid NOT IN (SELECT MIN(rowid) FROM activations GROUP BY session_id, part_id)")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS activations_session_part_idx ON activations(session_id, part_id)")

    def one(self, query: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
        with self.connection() as conn:
            return conn.execute(query, params).fetchone()

    def all(self, query: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self.connection() as conn:
            return conn.execute(query, params).fetchall()

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> int:
        with self.connection() as conn:
            return conn.execute(query, params).rowcount

    def execute_transaction(
        self, statements: list[tuple[str, tuple[Any, ...]]]
    ) -> None:
        """Execute related mutations atomically on one connection."""
        with self.connection() as conn:
            for query, params in statements:
                conn.execute(query, params)

    def cleanup_expired_sessions(
        self, *, now: datetime | None = None, retention_hours: int = 24
    ) -> int:
        """Remove raw transcripts for abandoned sessions past their retention window.

        The session row and all saved parts/attributes/activations remain available,
        while the session becomes a terminal ``EXPIRED`` record. Completed sessions
        are deliberately excluded because their retention is governed by completion.
        """
        current = now or datetime.now(timezone.utc)
        cutoff = (current - timedelta(hours=retention_hours)).astimezone(timezone.utc).isoformat()
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT id FROM sessions WHERE created_at < ? AND stage NOT IN (?, ?)",
                (cutoff, "COMPLETE", "EXPIRED"),
            ).fetchall()
            if not rows:
                return 0
            session_ids = [row["id"] for row in rows]
            placeholders = ", ".join("?" for _ in session_ids)
            conn.execute(
                f"DELETE FROM messages WHERE session_id IN ({placeholders})",
                tuple(session_ids),
            )
            conn.execute(
                f"""UPDATE sessions
                    SET stage = 'EXPIRED', transcript_removed = 1,
                        initial_statement = NULL, concern = NULL,
                        protective_intention = NULL, possible_need = NULL
                    WHERE id IN ({placeholders})""",
                tuple(session_ids),
            )
            return len(session_ids)
