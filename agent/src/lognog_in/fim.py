"""File Integrity Monitoring (FIM) module."""

import fnmatch
import hashlib
import json
import logging
import os
import sqlite3
import stat
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional
from contextlib import contextmanager

from watchdog.observers import Observer
from watchdog.events import (
    FileSystemEventHandler,
    FileCreatedEvent,
    FileModifiedEvent,
    FileDeletedEvent,
    FileMovedEvent,
)

from .config import Config, FIMPath
from .buffer import FIMEvent

logger = logging.getLogger(__name__)


def compute_file_hash(file_path: str, algorithm: str = "sha256") -> Optional[str]:
    """Compute the hash of a file."""
    try:
        hasher = hashlib.new(algorithm)
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
        return f"{algorithm}:{hasher.hexdigest()}"
    except Exception as e:
        logger.error(f"Error hashing file {file_path}: {e}")
        return None


def get_file_metadata(file_path: str) -> dict:
    """Get file metadata (owner, permissions, etc.)."""
    try:
        stat_info = os.stat(file_path)
        return {
            "size": stat_info.st_size,
            "mode": oct(stat_info.st_mode),
            "uid": stat_info.st_uid,
            "gid": stat_info.st_gid,
            "mtime": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
            "ctime": datetime.fromtimestamp(stat_info.st_ctime).isoformat(),
        }
    except Exception as e:
        logger.error(f"Error getting metadata for {file_path}: {e}")
        return {}


class BaselineDatabase:
    """SQLite database for storing file baselines."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (Config.get_data_dir() / "baseline.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the database."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS baselines (
                    file_path TEXT PRIMARY KEY,
                    hash TEXT NOT NULL,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
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

    def get_baseline(self, file_path: str) -> Optional[tuple[str, dict]]:
        """Get the baseline hash and metadata for a file."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT hash, metadata FROM baselines WHERE file_path = ?",
                (file_path,)
            ).fetchone()
            if row:
                return row["hash"], json.loads(row["metadata"] or "{}")
            return None

    def set_baseline(self, file_path: str, file_hash: str, metadata: dict) -> None:
        """Set or update the baseline for a file."""
        now = datetime.utcnow().isoformat()
        with self._lock:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO baselines (file_path, hash, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(file_path) DO UPDATE SET
                        hash = excluded.hash,
                        metadata = excluded.metadata,
                        updated_at = excluded.updated_at
                    """,
                    (file_path, file_hash, json.dumps(metadata), now, now)
                )
                conn.commit()

    def remove_baseline(self, file_path: str) -> None:
        """Remove the baseline for a file."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM baselines WHERE file_path = ?", (file_path,))
                conn.commit()

    def get_all_baselines(self) -> list[tuple[str, str, dict]]:
        """Get all baselines."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT file_path, hash, metadata FROM baselines").fetchall()
            return [
                (row["file_path"], row["hash"], json.loads(row["metadata"] or "{}"))
                for row in rows
            ]

    def clear(self) -> None:
        """Clear all baselines."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM baselines")
                conn.commit()


class FIMHandler(FileSystemEventHandler):
    """Handler for FIM events."""

    def __init__(
        self,
        fim_path: FIMPath,
        hostname: str,
        baseline_db: BaselineDatabase,
        on_event: Callable[[FIMEvent], None],
    ):
        self.fim_path = fim_path
        self.hostname = hostname
        self.baseline_db = baseline_db
        self.on_event = on_event
        self._lock = threading.Lock()

    def _matches_pattern(self, file_path: str) -> bool:
        """Check if the file matches the FIM pattern."""
        filename = os.path.basename(file_path)
        return fnmatch.fnmatch(filename, self.fim_path.pattern)

    def _create_event(
        self,
        event_type: str,
        file_path: str,
        previous_hash: Optional[str] = None,
        current_hash: Optional[str] = None,
    ) -> FIMEvent:
        """Create a FIM event."""
        metadata = get_file_metadata(file_path) if os.path.exists(file_path) else {}

        return FIMEvent(
            timestamp=datetime.utcnow().isoformat() + "Z",
            hostname=self.hostname,
            source="lognog-in",
            source_type="fim",
            event_type=event_type,
            file_path=file_path,
            previous_hash=previous_hash,
            current_hash=current_hash,
            file_owner=str(metadata.get("uid", "")),
            file_permissions=metadata.get("mode", ""),
            metadata={
                "fim_path": self.fim_path.path,
                "pattern": self.fim_path.pattern,
                **metadata,
            },
        )

    def on_created(self, event: FileCreatedEvent) -> None:
        """Handle file creation."""
        if event.is_directory:
            return
        if not self._matches_pattern(event.src_path):
            return

        logger.info(f"FIM: File created: {event.src_path}")

        current_hash = compute_file_hash(event.src_path)
        if current_hash:
            metadata = get_file_metadata(event.src_path)
            self.baseline_db.set_baseline(event.src_path, current_hash, metadata)

            fim_event = self._create_event(
                event_type="created",
                file_path=event.src_path,
                current_hash=current_hash,
            )
            self.on_event(fim_event)

    def on_modified(self, event: FileModifiedEvent) -> None:
        """Handle file modification."""
        if event.is_directory:
            return
        if not self._matches_pattern(event.src_path):
            return

        baseline = self.baseline_db.get_baseline(event.src_path)
        previous_hash = baseline[0] if baseline else None

        current_hash = compute_file_hash(event.src_path)
        if not current_hash:
            return

        # Only report if hash actually changed
        if previous_hash and previous_hash == current_hash:
            return

        logger.info(f"FIM: File modified: {event.src_path}")

        metadata = get_file_metadata(event.src_path)
        self.baseline_db.set_baseline(event.src_path, current_hash, metadata)

        fim_event = self._create_event(
            event_type="modified",
            file_path=event.src_path,
            previous_hash=previous_hash,
            current_hash=current_hash,
        )
        self.on_event(fim_event)

    def on_deleted(self, event: FileDeletedEvent) -> None:
        """Handle file deletion."""
        if event.is_directory:
            return
        if not self._matches_pattern(event.src_path):
            return

        logger.info(f"FIM: File deleted: {event.src_path}")

        baseline = self.baseline_db.get_baseline(event.src_path)
        previous_hash = baseline[0] if baseline else None

        self.baseline_db.remove_baseline(event.src_path)

        fim_event = self._create_event(
            event_type="deleted",
            file_path=event.src_path,
            previous_hash=previous_hash,
        )
        self.on_event(fim_event)

    def on_moved(self, event: FileMovedEvent) -> None:
        """Handle file move/rename."""
        if event.is_directory:
            return

        # Handle as delete + create
        if self._matches_pattern(event.src_path):
            baseline = self.baseline_db.get_baseline(event.src_path)
            if baseline:
                self.baseline_db.remove_baseline(event.src_path)
                fim_event = self._create_event(
                    event_type="deleted",
                    file_path=event.src_path,
                    previous_hash=baseline[0],
                )
                self.on_event(fim_event)

        if self._matches_pattern(event.dest_path):
            current_hash = compute_file_hash(event.dest_path)
            if current_hash:
                metadata = get_file_metadata(event.dest_path)
                self.baseline_db.set_baseline(event.dest_path, current_hash, metadata)
                fim_event = self._create_event(
                    event_type="created",
                    file_path=event.dest_path,
                    current_hash=current_hash,
                )
                self.on_event(fim_event)


class FileIntegrityMonitor:
    """
    Monitors files for integrity changes.

    Creates a baseline of file hashes and reports changes.
    """

    def __init__(self, config: Config, on_event: Callable[[FIMEvent], None]):
        self.config = config
        self.on_event = on_event
        self.baseline_db = BaselineDatabase()
        self._observer: Optional[Observer] = None
        self._handlers: list[FIMHandler] = []
        self._running = False

    def build_baseline(self) -> int:
        """
        Build initial baseline for all monitored paths.

        Returns the number of files baselined.
        """
        count = 0

        for fim_path in self.config.fim_paths:
            if not fim_path.enabled:
                continue

            path = Path(fim_path.path)

            if not path.exists():
                logger.warning(f"FIM path does not exist: {path}")
                continue

            # Find all matching files
            if path.is_file():
                files = [path]
            else:
                pattern = fim_path.pattern
                if fim_path.recursive:
                    files = list(path.rglob(pattern))
                else:
                    files = list(path.glob(pattern))

            for file_path in files:
                if not file_path.is_file():
                    continue

                file_hash = compute_file_hash(str(file_path))
                if file_hash:
                    metadata = get_file_metadata(str(file_path))
                    self.baseline_db.set_baseline(str(file_path), file_hash, metadata)
                    count += 1

        logger.info(f"FIM baseline built: {count} files")
        return count

    def start(self) -> None:
        """Start monitoring."""
        if self._running:
            return

        if not self.config.fim_enabled:
            logger.info("FIM is disabled in configuration")
            return

        # Build initial baseline if empty
        if not self.baseline_db.get_all_baselines():
            self.build_baseline()

        self._observer = Observer()

        for fim_path in self.config.fim_paths:
            if not fim_path.enabled:
                continue

            path = Path(fim_path.path)
            watch_dir = path if path.is_dir() else path.parent

            if not watch_dir.exists():
                logger.warning(f"FIM path does not exist: {watch_dir}")
                continue

            handler = FIMHandler(
                fim_path=fim_path,
                hostname=self.config.hostname,
                baseline_db=self.baseline_db,
                on_event=self.on_event,
            )
            self._handlers.append(handler)

            self._observer.schedule(
                handler,
                str(watch_dir),
                recursive=fim_path.recursive,
            )
            logger.info(f"FIM watching: {watch_dir} (pattern: {fim_path.pattern})")

        self._observer.start()
        self._running = True
        logger.info("File Integrity Monitor started")

    def stop(self) -> None:
        """Stop monitoring."""
        if not self._running:
            return

        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5.0)
            self._observer = None

        self._handlers.clear()
        self._running = False
        logger.info("File Integrity Monitor stopped")

    def is_running(self) -> bool:
        """Check if monitoring is running."""
        return self._running

    def verify_baseline(self) -> list[FIMEvent]:
        """
        Verify all baselined files against current state.

        Returns list of FIM events for any changes detected.
        """
        events = []

        for file_path, baseline_hash, baseline_metadata in self.baseline_db.get_all_baselines():
            if not os.path.exists(file_path):
                # File was deleted
                event = FIMEvent(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    hostname=self.config.hostname,
                    source="lognog-in",
                    source_type="fim",
                    event_type="deleted",
                    file_path=file_path,
                    previous_hash=baseline_hash,
                    current_hash=None,
                    file_owner=str(baseline_metadata.get("uid", "")),
                    file_permissions=baseline_metadata.get("mode", ""),
                    metadata={"verification": True},
                )
                events.append(event)
                self.baseline_db.remove_baseline(file_path)
                continue

            current_hash = compute_file_hash(file_path)
            if current_hash and current_hash != baseline_hash:
                # File was modified
                metadata = get_file_metadata(file_path)
                event = FIMEvent(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    hostname=self.config.hostname,
                    source="lognog-in",
                    source_type="fim",
                    event_type="modified",
                    file_path=file_path,
                    previous_hash=baseline_hash,
                    current_hash=current_hash,
                    file_owner=str(metadata.get("uid", "")),
                    file_permissions=metadata.get("mode", ""),
                    metadata={"verification": True, **metadata},
                )
                events.append(event)
                self.baseline_db.set_baseline(file_path, current_hash, metadata)

        return events
