"""Persistent file-tail offset store.

Clones the EventBookmark pattern from collectors/windows_events.py so that the
file watcher can survive a restart without re-reading (and re-shipping) whole
files from offset 0. Offsets are keyed by (file_id, path): file_id is the
stable inode / file identity, path disambiguates when two files share an id
after a rotate-by-rename, and it makes the DB rows human-readable.
"""

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .config import Config


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FileOffsetStore:
    """SQLite-backed store of per-file read offsets.

    Thread-safe. Intended to be shared across LogFileHandler instances so that
    every watched file's tail position is durable across agent restarts.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (Config.get_data_dir() / "file_offsets.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS file_offsets (
                    file_id INTEGER NOT NULL,
                    path TEXT NOT NULL,
                    offset INTEGER NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (file_id, path)
                )
                """
            )
            conn.commit()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        try:
            yield conn
        finally:
            conn.close()

    def get_offset(self, file_id: int, path: str) -> Optional[int]:
        """Return the stored offset for this file, or None if unseen.

        The file's stable identity (``file_id``, i.e. inode) is authoritative:
        it survives a rotate-by-rename where the path changes but the bytes are
        the same file. We therefore look up primarily by ``file_id`` and treat
        ``path`` as descriptive. An exact (file_id, path) match wins; otherwise
        any row with the same ``file_id`` is used so a rename doesn't cause a
        re-read from offset 0.
        """
        with self._lock:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT offset FROM file_offsets WHERE file_id = ? AND path = ?",
                    (file_id, path),
                ).fetchone()
                if row is not None:
                    return row[0]
                # Fall back to the same file id under a different path (rename).
                row = conn.execute(
                    "SELECT offset FROM file_offsets WHERE file_id = ? ORDER BY updated_at DESC LIMIT 1",
                    (file_id,),
                ).fetchone()
                return row[0] if row else None

    def set_offset(self, file_id: int, path: str, offset: int) -> None:
        """Persist the read offset for this file, flushed immediately.

        Keyed by ``file_id`` so a rotate-by-rename updates the same logical
        file's row (with its new path) rather than accumulating a duplicate.
        """
        with self._lock:
            with self._get_connection() as conn:
                # Remove any prior row for this file id (possibly under an old
                # path) before writing the current path/offset, keeping one row
                # per stable file identity.
                conn.execute("DELETE FROM file_offsets WHERE file_id = ?", (file_id,))
                conn.execute(
                    """
                    INSERT OR REPLACE INTO file_offsets (file_id, path, offset, updated_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (file_id, path, offset, _utcnow_iso()),
                )
                conn.commit()

    def all_offsets(self) -> dict[tuple[int, str], int]:
        """Return every stored offset as {(file_id, path): offset}."""
        with self._lock:
            with self._get_connection() as conn:
                rows = conn.execute(
                    "SELECT file_id, path, offset FROM file_offsets"
                ).fetchall()
                return {(r[0], r[1]): r[2] for r in rows}

    def prune(self, live_keys: set[tuple[int, str]]) -> int:
        """Delete offset rows whose (file_id, path) is not in ``live_keys``.

        Returns the number of rows pruned. Keeps the table from growing without
        bound as files are rotated away and deleted.
        """
        with self._lock:
            with self._get_connection() as conn:
                rows = conn.execute(
                    "SELECT file_id, path FROM file_offsets"
                ).fetchall()
                stale = [(fid, p) for (fid, p) in rows if (fid, p) not in live_keys]
                for fid, p in stale:
                    conn.execute(
                        "DELETE FROM file_offsets WHERE file_id = ? AND path = ?",
                        (fid, p),
                    )
                conn.commit()
                return len(stale)
