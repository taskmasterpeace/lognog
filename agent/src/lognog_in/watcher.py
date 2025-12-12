"""File watcher module using watchdog."""

import fnmatch
import logging
import os
import threading
from datetime import datetime
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
    ):
        self.watch_path = watch_path
        self.hostname = hostname
        self.on_event = on_event
        self._file_positions: dict[str, int] = {}
        self._lock = threading.Lock()

    def _matches_pattern(self, file_path: str) -> bool:
        """Check if the file matches the watch pattern."""
        filename = os.path.basename(file_path)
        return fnmatch.fnmatch(filename, self.watch_path.pattern)

    def _read_new_lines(self, file_path: str) -> list[str]:
        """Read new lines from a file since last read."""
        try:
            with self._lock:
                current_pos = self._file_positions.get(file_path, 0)

                with open(file_path, "r", errors="replace") as f:
                    # Check if file was truncated (rotated)
                    f.seek(0, 2)  # Seek to end
                    file_size = f.tell()

                    if file_size < current_pos:
                        # File was truncated, start from beginning
                        current_pos = 0

                    f.seek(current_pos)
                    lines = f.readlines()

                    # Update position
                    self._file_positions[file_path] = f.tell()

                return [line.rstrip("\n\r") for line in lines if line.strip()]
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return []

    def _process_file(self, file_path: str) -> None:
        """Process a file and emit events for new lines."""
        if not self._matches_pattern(file_path):
            return

        if not os.path.isfile(file_path):
            return

        lines = self._read_new_lines(file_path)
        timestamp = datetime.utcnow().isoformat() + "Z"

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

    def on_created(self, event: FileCreatedEvent) -> None:
        """Handle file creation."""
        if event.is_directory:
            return
        logger.debug(f"File created: {event.src_path}")
        # Initialize position tracking for new file
        with self._lock:
            self._file_positions[event.src_path] = 0
        self._process_file(event.src_path)

    def on_modified(self, event: FileModifiedEvent) -> None:
        """Handle file modification."""
        if event.is_directory:
            return
        logger.debug(f"File modified: {event.src_path}")
        self._process_file(event.src_path)

    def on_moved(self, event: FileMovedEvent) -> None:
        """Handle file move/rename."""
        if event.is_directory:
            return
        logger.debug(f"File moved: {event.src_path} -> {event.dest_path}")
        # Update position tracking for moved file
        with self._lock:
            if event.src_path in self._file_positions:
                self._file_positions[event.dest_path] = self._file_positions.pop(event.src_path)


class FileWatcher:
    """
    Watches multiple paths for log file changes.

    Uses watchdog for cross-platform file system events.
    """

    def __init__(self, config: Config, on_event: Callable[[LogEvent], None]):
        self.config = config
        self.on_event = on_event
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
