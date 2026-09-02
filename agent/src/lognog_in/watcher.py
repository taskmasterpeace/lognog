"""File watcher module using watchdog.

Tails log files the way a forwarder is expected to:

- Reads by BYTE offset so a partially written last line (no newline yet) is
  held back and shipped whole once the writer finishes it — previously the
  fragment shipped immediately and the remainder became a second event.
- Decodes with a per-path encoding (UTF-8 default, BOM-aware) instead of the
  locale codec, so UTF-8 logs on a cp1252 Windows box aren't mangled.
- Optional multi-line merging (``multiline_pattern``) so stack traces and
  multi-line JSON stay one event.
- ``exclude`` globs, ``start_position`` (``end``/``beginning``) and a periodic
  re-scan that catches changes the OS watcher missed (SMB shares, containers)
  and flushes held-back partial lines / pending multi-line events.
- Hands each file read to the buffer as ONE batch.
"""

import fnmatch
import logging
import os
import re
import threading
import time
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

# A partial trailing line is shipped anyway once it has sat unchanged this long
# (writers that don't newline-terminate their last line).
PARTIAL_LINE_TIMEOUT = 3.0
# A pending multi-line event is flushed once no continuation arrived for this long.
MULTILINE_TIMEOUT = 3.0
MULTILINE_MAX_LINES = 500
MULTILINE_MAX_BYTES = 256 * 1024
# Offset-store pruning walks the whole watched tree; don't do it on every event.
PRUNE_INTERVAL = 60.0
# Never read more than this per pass so one huge backlog can't starve others.
MAX_READ_BYTES = 8 * 1024 * 1024
_BOM = b"\xef\xbb\xbf"


def split_complete_lines(data: bytes) -> tuple[list[bytes], int]:
    """Split ``data`` into newline-terminated lines.

    Returns ``(lines, consumed)`` where ``consumed`` is the number of bytes
    covered by the returned lines. Any trailing fragment without a newline is
    NOT returned and not counted, so the caller can leave the file offset at
    the start of the fragment and pick it up whole next time.
    """
    if not data:
        return [], 0
    last_nl = data.rfind(b"\n")
    if last_nl == -1:
        return [], 0
    complete = data[: last_nl + 1]
    lines = complete.split(b"\n")[:-1]  # drop the empty tail after the final \n
    return lines, last_nl + 1


def decode_line(raw: bytes, encoding: str) -> str:
    """Decode one raw line, tolerating bad bytes and stripping CR/BOM."""
    if raw.startswith(_BOM):
        raw = raw[len(_BOM):]
    try:
        text = raw.decode(encoding, errors="replace")
    except LookupError:
        text = raw.decode("utf-8", errors="replace")
    return text.rstrip("\r").lstrip("﻿")


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
        on_batch: Optional[Callable[[list[LogEvent]], None]] = None,
        default_index: Optional[str] = None,
    ):
        self.watch_path = watch_path
        self.hostname = hostname
        self.on_event = on_event
        # When provided, every file read is delivered as ONE list (one buffer
        # transaction) instead of one callback per line.
        self.on_batch = on_batch
        self.default_index = default_index
        # Persistent offset store keyed by (file_id, path) so offsets survive an
        # agent restart -> no full-file re-read / duplication. If none is
        # provided (e.g. some unit tests) fall back to an in-process store so
        # behavior is still correct within a single run.
        self._offsets = offset_store or FileOffsetStore()
        self._lock = threading.RLock()
        self._last_prune = 0.0
        # path -> (offset of the fragment, first time we saw it) for partial lines.
        self._partial: dict[str, tuple[int, float]] = {}
        # path -> (lines, first_seen) for an in-progress multi-line event.
        self._pending: dict[str, tuple[list[str], float]] = {}
        self._multiline_re = (
            re.compile(watch_path.multiline_pattern) if watch_path.multiline_pattern else None
        )

    # ------------------------------------------------------------------ match
    def _matches_pattern(self, file_path: str) -> bool:
        """Check if the file matches the watch pattern and no exclude."""
        filename = os.path.basename(file_path)
        if not fnmatch.fnmatch(filename, self.watch_path.pattern):
            return False
        return not self._is_excluded(file_path)

    def _is_excluded(self, file_path: str) -> bool:
        if not self.watch_path.exclude:
            return False
        filename = os.path.basename(file_path)
        normalized = file_path.replace("\\", "/")
        for pattern in self.watch_path.exclude:
            if fnmatch.fnmatch(filename, pattern) or fnmatch.fnmatch(normalized, pattern):
                return True
        return False

    @staticmethod
    def _file_id(stat_result) -> int:
        """Return a stable identity for a file from its stat result.

        Uses st_ino where available (set on Windows too by Python's os.stat for
        NTFS); falls back to a device/size tuple hash if the inode is 0.
        """
        if stat_result.st_ino:
            return stat_result.st_ino
        return hash((stat_result.st_dev, stat_result.st_ctime_ns, stat_result.st_size))

    # ------------------------------------------------------------------- read
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

        A trailing fragment with no newline is normally held back (``new_pos``
        stops before it) so it ships whole later; it is released once it has
        been sitting unchanged for ``PARTIAL_LINE_TIMEOUT`` seconds.
        """
        try:
            # Resolve a stable identity for this file.
            file_id = self._file_id(os.stat(file_path))
            stored = self._offsets.get_offset(file_id, file_path)
            current_pos = stored if stored is not None else 0

            with open(file_path, "rb") as f:
                # Check if file was truncated (rotated in place)
                f.seek(0, 2)  # Seek to end
                file_size = f.tell()

                if file_size < current_pos:
                    # File was truncated, start from beginning
                    current_pos = 0
                    self._partial.pop(file_path, None)

                f.seek(current_pos)
                data = f.read(MAX_READ_BYTES)

            raw_lines, consumed = split_complete_lines(data)
            new_pos = current_pos + consumed
            fragment = data[consumed:]

            if fragment:
                frag_pos = new_pos
                seen = self._partial.get(file_path)
                now = time.monotonic()
                if seen and seen[0] == frag_pos and now - seen[1] >= PARTIAL_LINE_TIMEOUT:
                    # The writer never finished this line; ship it as-is.
                    raw_lines.append(fragment)
                    new_pos += len(fragment)
                    self._partial.pop(file_path, None)
                elif not seen or seen[0] != frag_pos:
                    self._partial[file_path] = (frag_pos, now)
            else:
                self._partial.pop(file_path, None)

            self._maybe_prune_dead_positions()

            encoding = self.watch_path.encoding
            lines = [decode_line(raw, encoding) for raw in raw_lines]
            return [line for line in lines if line.strip()], file_id, new_pos
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

    def _maybe_prune_dead_positions(self) -> None:
        now = time.monotonic()
        if now - self._last_prune < PRUNE_INTERVAL:
            return
        self._last_prune = now
        self._prune_dead_positions()

    def _prune_dead_positions(self) -> None:
        """Drop persisted offsets for files that no longer exist.

        Offsets are keyed by (file_id, path); once watchdog stops emitting
        events for a rotated/deleted file its row would otherwise leak. We
        enumerate the live files under the watched tree and prune everything
        else from the offset store.
        """
        try:
            live_keys: set[tuple[int, str]] = set()
            for full in self.iter_files(include_unmatched=True):
                try:
                    live_keys.add((self._file_id(os.stat(full)), full))
                except OSError:
                    continue
            self._offsets.prune(live_keys)
        except Exception as e:
            logger.debug(f"Position prune skipped: {e}")

    def iter_files(self, include_unmatched: bool = False):
        """Yield files under the watched root (matching the pattern unless asked otherwise)."""
        watch_root = self.watch_path.path
        if os.path.isfile(watch_root):
            yield watch_root
            return
        if "*" in watch_root:
            parent = Path(watch_root)
            while "*" in str(parent):
                parent = parent.parent
            watch_root = str(parent)
        if not os.path.isdir(watch_root):
            return
        for root, _dirs, files in os.walk(watch_root):
            for name in files:
                full = os.path.join(root, name)
                if include_unmatched or self._matches_pattern(full):
                    yield full
            if not self.watch_path.recursive:
                break

    # ------------------------------------------------------------------ emit
    def _make_event(self, file_path: str, message: str, timestamp: str, line_count: int = 1) -> LogEvent:
        metadata = {
            "watch_path": self.watch_path.path,
            "pattern": self.watch_path.pattern,
        }
        if line_count > 1:
            metadata["line_count"] = line_count
        return LogEvent(
            timestamp=timestamp,
            hostname=self.hostname,
            source="lognog-in",
            source_type=self.watch_path.source_type or "file",
            file_path=file_path,
            message=message,
            metadata=metadata,
            index=self.watch_path.index or self.default_index,
        )

    def _deliver(self, events: list[LogEvent]) -> None:
        if not events:
            return
        if self.on_batch is not None:
            self.on_batch(events)
        else:
            for event in events:
                self.on_event(event)

    def _group_multiline(self, file_path: str, lines: list[str]) -> list[list[str]]:
        """Merge continuation lines into the preceding start line.

        The last group is kept pending (it may continue on the next read)
        unless it exceeds the size caps; ``flush_pending`` releases it later.
        """
        assert self._multiline_re is not None
        groups: list[list[str]] = []
        pending = self._pending.pop(file_path, None)
        current: list[str] = list(pending[0]) if pending else []
        for line in lines:
            if self._multiline_re.search(line):
                if current:
                    groups.append(current)
                current = [line]
            elif current:
                current.append(line)
            else:
                # Continuation with nothing to attach to: it is its own event.
                current = [line]
            if len(current) >= MULTILINE_MAX_LINES or sum(len(l) for l in current) >= MULTILINE_MAX_BYTES:
                groups.append(current)
                current = []
        if current:
            self._pending[file_path] = (current, time.monotonic())
        return groups

    def _process_file(self, file_path: str, ignore_pattern: bool = False) -> None:
        """Process a file and emit events for new lines.

        ``ignore_pattern`` lets a rotation handler flush the tail of a file whose
        new name no longer matches the watch pattern (e.g. app.log -> app.log.1).
        """
        if not ignore_pattern and not self._matches_pattern(file_path):
            return

        if not os.path.isfile(file_path):
            return

        with self._lock:
            lines, file_id, new_pos = self._read_new_lines(file_path)
            timestamp = datetime.now(timezone.utc).isoformat()

            events: list[LogEvent] = []
            if self._multiline_re is not None:
                for group in self._group_multiline(file_path, lines):
                    events.append(self._make_event(file_path, "\n".join(group), timestamp, len(group)))
            else:
                events = [self._make_event(file_path, line, timestamp) for line in lines]

            self._deliver(events)

            # Commit the read position only AFTER every line above has been
            # handed to the buffer, so a crash mid-processing re-reads the tail
            # instead of losing it (at-least-once). With multi-line merging the
            # pending group is re-read on restart as well (duplicate, not loss).
            self._commit_offset(file_id, file_path, new_pos)

    def flush_pending(self, force: bool = False) -> int:
        """Emit multi-line events that have gone quiet (or all, when forced)."""
        emitted = 0
        with self._lock:
            now = time.monotonic()
            for path in list(self._pending):
                lines, first_seen = self._pending[path]
                if force or now - first_seen >= MULTILINE_TIMEOUT:
                    del self._pending[path]
                    self._deliver([self._make_event(path, "\n".join(lines), datetime.now(timezone.utc).isoformat(), len(lines))])
                    emitted += 1
        return emitted

    def initialize_offsets(self) -> int:
        """Apply ``start_position`` to files that exist before we start tailing.

        For ``end`` (default) every matching file without a stored offset gets
        its current size recorded, so only lines written from now on ship.
        Returns the number of files initialised.
        """
        if self.watch_path.start_position != "end":
            return 0
        initialised = 0
        for path in self.iter_files():
            try:
                st = os.stat(path)
            except OSError:
                continue
            file_id = self._file_id(st)
            if self._offsets.get_offset(file_id, path) is None:
                self._offsets.set_offset(file_id, path, st.st_size)
                initialised += 1
        return initialised

    def scan(self) -> int:
        """Poll every matching file for growth (safety net for missed OS events).

        Only files whose size differs from the stored offset are opened.
        Returns the number of files processed.
        """
        processed = 0
        for path in self.iter_files():
            try:
                st = os.stat(path)
            except OSError:
                continue
            stored = self._offsets.get_offset(self._file_id(st), path)
            if stored is not None and stored == st.st_size and path not in self._partial:
                continue
            self._process_file(path)
            processed += 1
        self.flush_pending()
        return processed

    # --------------------------------------------------------- watchdog hooks
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

    Uses watchdog for cross-platform file system events, plus a periodic scan
    thread as a safety net.
    """

    def __init__(
        self,
        config: Config,
        on_event: Callable[[LogEvent], None],
        offset_store: Optional[FileOffsetStore] = None,
        on_batch: Optional[Callable[[list[LogEvent]], None]] = None,
    ):
        self.config = config
        self.on_event = on_event
        self.on_batch = on_batch
        # One shared, persistent offset store for every handler.
        self._offset_store = offset_store or FileOffsetStore()
        self._observer: Optional[Observer] = None
        self._handlers: list[LogFileHandler] = []
        self._running = False
        self._scan_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._scans = 0

    def start(self) -> None:
        """Start watching all configured paths."""
        if self._running:
            return

        self._observer = Observer()
        self._stop_event.clear()

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
                on_batch=self.on_batch,
                default_index=self.config.index,
            )
            skipped = handler.initialize_offsets()
            if skipped:
                logger.info(f"Tailing from the end of {skipped} existing file(s) under {watch_dir}")
            self._handlers.append(handler)

            self._observer.schedule(
                handler,
                str(watch_dir),
                recursive=watch_path.recursive,
            )
            extras = []
            if watch_path.exclude:
                extras.append(f"exclude={watch_path.exclude}")
            if watch_path.multiline_pattern:
                extras.append("multiline")
            if watch_path.index:
                extras.append(f"index={watch_path.index}")
            logger.info(
                f"Watching: {watch_dir} (pattern: {watch_path.pattern}"
                + (", " + ", ".join(extras) if extras else "") + ")"
            )

        self._observer.start()
        self._running = True

        if self.config.scan_interval_seconds > 0 and self._handlers:
            self._scan_thread = threading.Thread(target=self._scan_loop, daemon=True, name="lognog-scan")
            self._scan_thread.start()
        logger.info("File watcher started")

    def _scan_loop(self) -> None:
        interval = max(1, self.config.scan_interval_seconds)
        while not self._stop_event.wait(timeout=interval):
            for handler in list(self._handlers):
                try:
                    handler.scan()
                except Exception as e:
                    logger.debug(f"Scan error for {handler.watch_path.path}: {e}")
            self._scans += 1

    def scan_now(self) -> int:
        """Run one scan pass synchronously (used by the tray / CLI)."""
        return sum(h.scan() for h in list(self._handlers))

    def stop(self) -> None:
        """Stop watching."""
        if not self._running:
            return

        self._stop_event.set()
        if self._scan_thread:
            self._scan_thread.join(timeout=5.0)
            self._scan_thread = None

        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5.0)
            self._observer = None

        # Ship anything still held for multi-line merging.
        for handler in self._handlers:
            try:
                handler.flush_pending(force=True)
            except Exception:
                pass
        self._handlers.clear()
        self._running = False
        logger.info("File watcher stopped")

    def is_running(self) -> bool:
        """Check if the watcher is running."""
        return self._running

    def get_watched_paths(self) -> list[str]:
        """Get list of currently watched paths."""
        return [wp.path for wp in self.config.watch_paths if wp.enabled]

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "paths": self.get_watched_paths(),
            "active_handlers": len(self._handlers),
            "scans": self._scans,
        }
