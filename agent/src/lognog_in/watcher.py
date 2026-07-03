"""File watcher module using watchdog."""

import fnmatch
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from watchdog.observers import Observer
from watchdog.events import (
    FileSystemEventHandler,
    FileCreatedEvent,
    FileModifiedEvent,
    FileMovedEvent,
)

from .config import Config, WatchPath
from .buffer import LogEvent
from .offset_store import FileOffsetStore

logger = logging.getLogger(__name__)


class LogFileHandler(FileSystemEventHandler):
    """
    Handler for log file events.

    Watches for file modifications and reads new lines,
    then passes them to the callback.
    """

    def __init__(
        self,
        watch_path: WatchPath,
        hostname: str,
        on_event: Callable[[LogEvent], None],
        offset_store: Optional[FileOffsetStore] = None,
    ):
        self.watch_path = watch_path
        self.hostname = hostname
        self.on_event = on_event
        # Persistent offset store keyed by (file_id, path) so offsets survive an
        # agent restart -> no full-file re-read / duplication. If none is
        # provided (e.g. some unit tests) fall back to an in-process store so
        # behavior is still correct within a single run.
        self._offsets = offset_store or FileOffsetStore()
        self._lock = threading.Lock()

    def _matches_pattern(self, file_path: str) -> bool:
        """Check if the file matches the watch pattern."""
        filename = os.path.basename(file_path)
        return fnmatch.fnmatch(filename, self.watch_path.pattern)

    @staticmethod
    def _file_id(stat_result) -> int:
        """Return a stable identity for a file from its stat result.

        Uses st_ino where available (set on Windows too by Python's os.stat for
        NTFS); falls back to a device/size tuple hash if the inode is 0.
        """
        if stat_result.st_ino:
            return stat_result.st_ino
        return hash((stat_result.st_dev, stat_result.st_ctime_ns, stat_result.st_size))

    def _read_new_lines(self, file_path: str) -> tuple[list[str], int | None, int]:
        """Read new lines from a file since last read.

        Returns ``(lines, file_id, new_pos)``. The offset is loaded from the
        persistent store (keyed by (file_id, path)) so the file resumes where it
        left off after a restart, but the new offset is deliberately NOT
        committed here — the caller must call :meth:`_commit_offset` only AFTER
        the lines are durably buffered. Committing on read created a crash window
        in which the offset advanced past lines that were never buffered,
        permanently losing them. Committing after buffering makes delivery
        at-least-once (a crash re-reads the tail; duplicates are deduplicated
        downstream) instead of at-most-once.
        """
        try:
            # Resolve a stable identity for this file.
            file_id = self._file_id(os.stat(file_path))
            stored = self._offsets.get_offset(file_id, file_path)
            current_pos = stored if stored is not None else 0

            with open(file_path, "r", errors="replace") as f:
                # Check if file was truncated (rotated in place)
                f.seek(0, 2)  # Seek to end
                file_size = f.tell()

                if file_size < current_pos:
                    # File was truncated, start from beginning
                    current_pos = 0

                f.seek(current_pos)
                lines = f.readlines()
                new_pos = f.tell()

            self._prune_dead_positions()

            return [line.rstrip("\n\r") for line in lines if line.strip()], file_id, new_pos
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return [], None, 0

    def _commit_offset(self, file_id: int | None, file_path: str, new_pos: int) -> None:
        """Persist the read position AFTER the lines have been buffered.

        See :meth:`_read_new_lines` for why this is separate: it must run only
        once the events are durably in the buffer, so a crash cannot skip them.
        """
        if file_id is None:
            return
        self._offsets.set_offset(file_id, file_path, new_pos)

    def _prune_dead_positions(self) -> None:
        """Drop persisted offsets for files that no longer exist.

        Offsets are keyed by (file_id, path); once watchdog stops emitting
        events for a rotated/deleted file its row would otherwise leak. We
        enumerate the live files under the watched tree and prune everything
        else from the offset store.
        """
        try:
            live_keys: set[tuple[int, str]] = set()
            watch_root = self.watch_path.path
            for root, _dirs, files in os.walk(watch_root):
                for name in files:
                    full = os.path.join(root, name)
                    try:
                        live_keys.add((self._file_id(os.stat(full)), full))
                    except OSError:
                        continue
                if not self.watch_path.recursive:
                    break
            self._offsets.prune(live_keys)
        except Exception as e:
            logger.debug(f"Position prune skipped: {e}")

    def _process_file(self, file_path: str, ignore_pattern: bool = False) -> None:
        """Process a file and emit events for new lines.

        ``ignore_pattern`` lets a rotation handler flush the tail of a file whose
        new name no longer matches the watch pattern (e.g. app.log -> app.log.1).
        """
        if not ignore_pattern and not self._matches_pattern(file_path):
            return

        if not os.path.isfile(file_path):
            return

        lines, file_id, new_pos = self._read_new_lines(file_path)
        timestamp = datetime.now(timezone.utc).isoformat()

        for line in lines:
            event = LogEvent(
                timestamp=timestamp,
                hostname=self.hostname,
                source="lognog-in",
                source_type="file",
                file_path=file_path,
                message=line,
                metadata={
                    "watch_path": self.watch_path.path,
                    "pattern": self.watch_path.pattern,
                },
            )
            self.on_event(event)

        # Commit the read position only AFTER every line above has been handed to
        # the buffer, so a crash mid-processing re-reads the tail instead of
        # losing it (at-least-once).
        self._commit_offset(file_id, file_path, new_pos)

    def on_created(self, event: FileCreatedEvent) -> None:
        """Handle file creation."""
        if event.is_directory:
            return
        logger.debug(f"File created: {event.src_path}")
        # A newly-created file gets a fresh inode/file-id, so it naturally starts
        # reading from offset 0 without any explicit initialization. Process it
        # to pick up any content written at creation time.
        self._process_file(event.src_path)

    def on_modified(self, event: FileModifiedEvent) -> None:
        """Handle file modification."""
        if event.is_directory:
            return
        logger.debug(f"File modified: {event.src_path}")
        self._process_file(event.src_path)

    def on_moved(self, event: FileMovedEvent) -> None:
        """Handle file move/rename (log rotation by rename)."""
        if event.is_directory:
            return
        logger.debug(f"File moved: {event.src_path} -> {event.dest_path}")
        # Positions are keyed by inode/file-id, which is preserved across a
        # rename, so no remapping is needed. Flush any lines written to the file
        # just before the rename by reading from its new path, then prune the
        # now-dead source path.
        if os.path.isfile(event.dest_path):
            self._process_file(event.dest_path, ignore_pattern=True)
        self._prune_dead_positions()


class FileWatcher:
    """
    Watches multiple paths for log file changes.

    Uses watchdog for cross-platform file system events.
    """

    def __init__(
        self,
        config: Config,
        on_event: Callable[[LogEvent], None],
        offset_store: Optional[FileOffsetStore] = None,
    ):
        self.config = config
        self.on_event = on_event
        # One shared, persistent offset store for every handler.
        self._offset_store = offset_store or FileOffsetStore()
        self._observer: Optional[Observer] = None
        self._handlers: list[LogFileHandler] = []
        self._running = False

    def start(self) -> None:
        """Start watching all configured paths."""
        if self._running:
            return

        self._observer = Observer()

        for watch_path in self.config.watch_paths:
            if not watch_path.enabled:
                continue

            path = Path(watch_path.path)

            # Handle glob patterns in path
            if "*" in str(path):
                # For glob patterns, watch the parent directory
                parent = path.parent
                while "*" in str(parent):
                    parent = parent.parent
                watch_dir = parent
            else:
                watch_dir = path if path.is_dir() else path.parent

            if not watch_dir.exists():
                logger.warning(f"Watch path does not exist: {watch_dir}")
                continue

            handler = LogFileHandler(
                watch_path=watch_path,
                hostname=self.config.hostname,
                on_event=self.on_event,
                offset_store=self._offset_store,
            )
            self._handlers.append(handler)

            self._observer.schedule(
                handler,
                str(watch_dir),
                recursive=watch_path.recursive,
            )
            logger.info(f"Watching: {watch_dir} (pattern: {watch_path.pattern})")

        self._observer.start()
        self._running = True
        logger.info("File watcher started")

    def stop(self) -> None:
        """Stop watching."""
        if not self._running:
            return

        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5.0)
            self._observer = None

        self._handlers.clear()
        self._running = False
        logger.info("File watcher stopped")

    def is_running(self) -> bool:
        """Check if the watcher is running."""
        return self._running

    def get_watched_paths(self) -> list[str]:
        """Get list of currently watched paths."""
        return [wp.path for wp in self.config.watch_paths if wp.enabled]
