"""Event buffer with SQLite persistence for offline operation."""

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict
from contextlib import contextmanager

from .config import Config


def _utcnow_iso() -> str:
    """Current UTC time as an ISO-8601 string (timezone-aware)."""
    return datetime.now(timezone.utc).isoformat()


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

    Eviction policy:
    - Events are NEVER dropped just because a send attempt failed at the
      connection / 5xx level. Those failures are the server's fault and the
      buffer must survive a multi-minute (or multi-hour) outage.
    - The only automatic eviction is a hard capacity cap (max rows / max
      bytes). When the buffer is full the OLDEST events are dropped to make
      room, and a running ``dropped_count`` metric is bumped. This bounds
      disk/memory use without silently discarding events during a transient
      outage.
    - ``remove_stale_events`` still exists for purging genuine "poison"
      batches (events the server permanently rejects with a 4xx, tracked via
      the attempt counter), but it must only be called for server-rejected
      events, never for transient failures.
    """

    #: Default maximum number of buffered rows before oldest-drop kicks in.
    DEFAULT_MAX_ROWS = 500_000
    #: Default maximum total ``data`` bytes before oldest-drop kicks in.
    DEFAULT_MAX_BYTES = 512 * 1024 * 1024  # 512 MB

    def __init__(
        self,
        db_path: Optional[Path] = None,
        max_rows: int = DEFAULT_MAX_ROWS,
        max_bytes: int = DEFAULT_MAX_BYTES,
    ):
        self.db_path = db_path or (Config.get_data_dir() / "buffer.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.max_rows = max_rows if max_rows and max_rows > 0 else self.DEFAULT_MAX_ROWS
        self.max_bytes = max_bytes if max_bytes and max_bytes > 0 else self.DEFAULT_MAX_BYTES
        self._lock = threading.Lock()
        self._dropped_count = 0
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

    def _insert(self, conn, event_type: str, data: str) -> int:
        cursor = conn.execute(
            """
            INSERT INTO events (event_type, data, created_at)
            VALUES (?, ?, ?)
            """,
            (event_type, data, _utcnow_iso()),
        )
        return cursor.lastrowid or 0

    def _enforce_capacity(self, conn) -> None:
        """Drop the oldest events until the buffer is under its caps.

        Called while holding ``self._lock`` and inside an open connection.
        Bumps ``self._dropped_count`` for each evicted row so the overflow is
        observable rather than silent.
        """
        # Row cap.
        row = conn.execute("SELECT COUNT(*) AS c FROM events").fetchone()
        count = row["c"] if row else 0
        if count > self.max_rows:
            to_drop = count - self.max_rows
            dropped = conn.execute(
                """
                DELETE FROM events WHERE id IN (
                    SELECT id FROM events ORDER BY id ASC LIMIT ?
                )
                """,
                (to_drop,),
            ).rowcount
            self._dropped_count += dropped

        # Byte cap. Drop oldest rows until total data bytes fit the cap.
        total = conn.execute(
            "SELECT COALESCE(SUM(LENGTH(data)), 0) AS b FROM events"
        ).fetchone()["b"]
        while total > self.max_bytes:
            # Delete oldest 1000 rows (or fewer) at a time until within cap.
            row = conn.execute(
                "SELECT id, LENGTH(data) AS n FROM events ORDER BY id ASC LIMIT 1000"
            ).fetchall()
            if not row:
                break
            ids = [r["id"] for r in row]
            freed = sum(r["n"] for r in row)
            placeholders = ",".join("?" * len(ids))
            dropped = conn.execute(
                f"DELETE FROM events WHERE id IN ({placeholders})", ids
            ).rowcount
            self._dropped_count += dropped
            total -= freed

    def add_log_event(self, event: LogEvent) -> int:
        """Add a log event to the buffer."""
        with self._lock:
            with self._get_connection() as conn:
                event_id = self._insert(conn, "log", json.dumps(event.to_dict()))
                self._enforce_capacity(conn)
                conn.commit()
                return event_id

    def add_fim_event(self, event: FIMEvent) -> int:
        """Add a FIM event to the buffer."""
        with self._lock:
            with self._get_connection() as conn:
                event_id = self._insert(conn, "fim", json.dumps(event.to_dict()))
                self._enforce_capacity(conn)
                conn.commit()
                return event_id

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
                    ORDER BY id ASC
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
        """Increment the attempt counter for failed events.

        This MUST only be called for events the server explicitly and
        permanently rejected (a non-retryable 4xx). Transient / connection /
        5xx failures must NOT bump this counter, or a multi-minute outage
        would purge the whole buffer via ``remove_stale_events``.
        """
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
        """Remove events that the server has rejected too many times.

        Eviction here is keyed off the per-event ``attempts`` counter, which is
        only bumped for genuine server rejections (see ``increment_attempts``).
        It is NOT a time- or outage-based purge.
        """
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

    def total_bytes(self) -> int:
        """Approximate total size of buffered event data in bytes."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(LENGTH(data)), 0) AS b FROM events"
            ).fetchone()
            return row["b"] if row else 0

    @property
    def dropped_count(self) -> int:
        """Number of events dropped by the capacity cap (oldest-drop policy)."""
        return self._dropped_count

    def clear(self) -> None:
        """Clear all buffered events."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM events")
                conn.commit()
