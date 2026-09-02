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
    # Target LogNog index (None = server default). Optional so events buffered
    # by older agent versions still deserialize.
    index: Optional[str] = None

    def to_dict(self) -> dict:
        data = asdict(self)
        if data.get("index") is None:
            data.pop("index", None)
        return data

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
        # Row / byte totals are tracked in memory (refreshed from the table on
        # removals) so the capacity check on every insert is O(1) instead of a
        # COUNT/SUM scan — that scan was the dominant cost at a few thousand
        # events per second.
        self._row_count = 0
        self._byte_total = 0
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the SQLite database."""
        with self._get_connection() as conn:
            # WAL: readers (get_batch / count) don't block the writer thread,
            # and commits are far cheaper than rollback-journal mode.
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA synchronous=NORMAL")
            except sqlite3.DatabaseError:
                pass
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
            self._refresh_totals(conn)

    def _refresh_totals(self, conn) -> None:
        """Re-read the row count / byte total from the table."""
        row = conn.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(data)), 0) AS b FROM events"
        ).fetchone()
        self._row_count = row["c"] if row else 0
        self._byte_total = row["b"] if row else 0

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
        self._row_count += 1
        self._byte_total += len(data.encode("utf-8"))
        return cursor.lastrowid or 0

    def _enforce_capacity(self, conn) -> None:
        """Drop the oldest events until the buffer is under its caps.

        Called while holding ``self._lock`` and inside an open connection.
        Bumps ``self._dropped_count`` for each evicted row so the overflow is
        observable rather than silent. Uses the in-memory totals; only when a
        cap is actually exceeded does it touch the table.
        """
        if self._row_count <= self.max_rows and self._byte_total <= self.max_bytes:
            return

        # Row cap.
        if self._row_count > self.max_rows:
            to_drop = self._row_count - self.max_rows
            dropped = conn.execute(
                """
                DELETE FROM events WHERE id IN (
                    SELECT id FROM events ORDER BY id ASC LIMIT ?
                )
                """,
                (to_drop,),
            ).rowcount
            self._dropped_count += dropped
            self._refresh_totals(conn)

        # Byte cap. Drop oldest rows until total data bytes fit the cap.
        while self._byte_total > self.max_bytes:
            # Delete oldest 1000 rows (or fewer) at a time until within cap.
            rows = conn.execute(
                "SELECT id, LENGTH(data) AS n FROM events ORDER BY id ASC LIMIT 1000"
            ).fetchall()
            if not rows:
                break
            ids = [r["id"] for r in rows]
            placeholders = ",".join("?" * len(ids))
            dropped = conn.execute(
                f"DELETE FROM events WHERE id IN ({placeholders})", ids
            ).rowcount
            self._dropped_count += dropped
            self._refresh_totals(conn)

    def add_log_event(self, event: LogEvent) -> int:
        """Add a log event to the buffer."""
        with self._lock:
            with self._get_connection() as conn:
                event_id = self._insert(conn, "log", json.dumps(event.to_dict()))
                self._enforce_capacity(conn)
                conn.commit()
                return event_id

    def add_log_events(self, events: list[LogEvent]) -> int:
        """Add many log events in ONE transaction.

        A busy log file can hand the tailer hundreds of lines per change
        notification; one commit per line was the throughput ceiling.
        Returns the number of rows inserted.
        """
        if not events:
            return 0
        with self._lock:
            with self._get_connection() as conn:
                payloads = [json.dumps(e.to_dict()) for e in events]
                now = _utcnow_iso()
                conn.executemany(
                    "INSERT INTO events (event_type, data, created_at) VALUES (?, ?, ?)",
                    [("log", p, now) for p in payloads],
                )
                self._row_count += len(payloads)
                self._byte_total += sum(len(p.encode("utf-8")) for p in payloads)
                self._enforce_capacity(conn)
                conn.commit()
                return len(events)

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
                self._refresh_totals(conn)

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
                self._refresh_totals(conn)
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
                self._row_count = 0
                self._byte_total = 0
