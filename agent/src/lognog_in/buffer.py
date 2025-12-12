"""Event buffer with SQLite persistence for offline operation."""

import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict
from contextlib import contextmanager

from .config import Config


@dataclass
class LogEvent:
    """A log event to be shipped."""
    timestamp: str
    hostname: str
    source: str
    source_type: str
    file_path: str
    message: str
    metadata: dict

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "LogEvent":
        return cls(**data)


@dataclass
class FIMEvent:
    """A file integrity monitoring event."""
    timestamp: str
    hostname: str
    source: str
    source_type: str
    event_type: str  # created, modified, deleted
    file_path: str
    previous_hash: Optional[str]
    current_hash: Optional[str]
    file_owner: Optional[str]
    file_permissions: Optional[str]
    metadata: dict

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "FIMEvent":
        return cls(**data)


class EventBuffer:
    """
    Thread-safe event buffer with SQLite persistence.

    Events are stored in SQLite when:
    - The server is unreachable
    - The batch hasn't been sent yet

    This ensures no events are lost during network issues or restarts.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (Config.get_data_dir() / "buffer.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the SQLite database."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    attempts INTEGER DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_created
                ON events(created_at)
            """)
            conn.commit()

    @contextmanager
    def _get_connection(self):
        """Get a database connection."""
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def add_log_event(self, event: LogEvent) -> int:
        """Add a log event to the buffer."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO events (event_type, data, created_at)
                    VALUES (?, ?, ?)
                    """,
                    ("log", json.dumps(event.to_dict()), datetime.utcnow().isoformat())
                )
                conn.commit()
                return cursor.lastrowid or 0

    def add_fim_event(self, event: FIMEvent) -> int:
        """Add a FIM event to the buffer."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO events (event_type, data, created_at)
                    VALUES (?, ?, ?)
                    """,
                    ("fim", json.dumps(event.to_dict()), datetime.utcnow().isoformat())
                )
                conn.commit()
                return cursor.lastrowid or 0

    def get_batch(self, batch_size: int = 100) -> list[tuple[int, str, dict]]:
        """
        Get a batch of events to send.

        Returns list of (id, event_type, event_data) tuples.
        """
        with self._lock:
            with self._get_connection() as conn:
                rows = conn.execute(
                    """
                    SELECT id, event_type, data FROM events
                    ORDER BY created_at ASC
                    LIMIT ?
                    """,
                    (batch_size,)
                ).fetchall()
                return [(row["id"], row["event_type"], json.loads(row["data"])) for row in rows]

    def remove_events(self, event_ids: list[int]) -> None:
        """Remove successfully sent events from the buffer."""
        if not event_ids:
            return
        with self._lock:
            with self._get_connection() as conn:
                placeholders = ",".join("?" * len(event_ids))
                conn.execute(
                    f"DELETE FROM events WHERE id IN ({placeholders})",
                    event_ids
                )
                conn.commit()

    def increment_attempts(self, event_ids: list[int]) -> None:
        """Increment the attempt counter for failed events."""
        if not event_ids:
            return
        with self._lock:
            with self._get_connection() as conn:
                placeholders = ",".join("?" * len(event_ids))
                conn.execute(
                    f"UPDATE events SET attempts = attempts + 1 WHERE id IN ({placeholders})",
                    event_ids
                )
                conn.commit()

    def remove_stale_events(self, max_attempts: int = 10) -> int:
        """Remove events that have failed too many times."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "DELETE FROM events WHERE attempts >= ?",
                    (max_attempts,)
                )
                conn.commit()
                return cursor.rowcount

    def count(self) -> int:
        """Get the number of buffered events."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT COUNT(*) as count FROM events").fetchone()
            return row["count"] if row else 0

    def clear(self) -> None:
        """Clear all buffered events."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM events")
                conn.commit()
