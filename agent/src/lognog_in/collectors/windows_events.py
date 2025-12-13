"""Windows Event Log collector using pywin32."""

import logging
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

try:
    import win32evtlog
    import win32evtlogutil
    import win32con
    import pywintypes
    HAS_PYWIN32 = True
except ImportError:
    HAS_PYWIN32 = False

from ..buffer import LogEvent
from ..config import Config

logger = logging.getLogger(__name__)


# Windows Event severity mapping
EVENT_TYPE_MAP = {
    win32evtlog.EVENTLOG_ERROR_TYPE: "error",
    win32evtlog.EVENTLOG_WARNING_TYPE: "warning",
    win32evtlog.EVENTLOG_INFORMATION_TYPE: "info",
    win32evtlog.EVENTLOG_AUDIT_SUCCESS: "info",
    win32evtlog.EVENTLOG_AUDIT_FAILURE: "warning",
} if HAS_PYWIN32 else {}


# High-value security events
HIGH_VALUE_EVENTS = {
    4624: "Successful logon",
    4625: "Failed logon",
    4648: "Explicit credential logon",
    4672: "Special privileges assigned",
    4688: "Process creation",
    4698: "Scheduled task created",
    4699: "Scheduled task deleted",
    4700: "Scheduled task enabled",
    4701: "Scheduled task disabled",
    4702: "Scheduled task updated",
    4720: "User account created",
    4722: "User account enabled",
    4723: "Password change attempt",
    4724: "Password reset attempt",
    4725: "User account disabled",
    4726: "User account deleted",
    4732: "Member added to security-enabled local group",
    4733: "Member removed from security-enabled local group",
    4738: "User account changed",
    4740: "User account locked out",
    4756: "Member added to security-enabled universal group",
    4757: "Member removed from security-enabled universal group",
    7045: "Service installed",
    7040: "Service start type changed",
}


class EventBookmark:
    """Manages bookmarks for Windows Event Log reading."""

    def __init__(self, db_path: Path):
        """Initialize the bookmark database."""
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the SQLite database."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS bookmarks (
                    channel TEXT PRIMARY KEY,
                    record_number INTEGER NOT NULL,
                    timestamp TEXT NOT NULL
                )
            """)
            conn.commit()

    @contextmanager
    def _get_connection(self):
        """Get a database connection."""
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        try:
            yield conn
        finally:
            conn.close()

    def get_bookmark(self, channel: str) -> Optional[int]:
        """Get the last read record number for a channel."""
        with self._lock:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT record_number FROM bookmarks WHERE channel = ?",
                    (channel,)
                ).fetchone()
                return row[0] if row else None

    def set_bookmark(self, channel: str, record_number: int) -> None:
        """Set the bookmark for a channel."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO bookmarks (channel, record_number, timestamp)
                    VALUES (?, ?, ?)
                    """,
                    (channel, record_number, datetime.utcnow().isoformat())
                )
                conn.commit()


class WindowsEventCollector:
    """
    Collects Windows Event Logs using pywin32.

    Features:
    - Collects from multiple channels (Security, System, Application, etc.)
    - Event ID filtering
    - Bookmark persistence to avoid re-reading
    - Efficient batch reading
    - Graceful fallback if pywin32 not available
    """

    def __init__(
        self,
        channels: list[str],
        hostname: str,
        event_ids: Optional[list[int]] = None,
        poll_interval: int = 10,
        batch_size: int = 100,
        on_event: Optional[Callable[[LogEvent], None]] = None,
    ):
        """
        Initialize the Windows Event collector.

        Args:
            channels: Event log channels to monitor (e.g., ['Security', 'System', 'Application'])
            hostname: Hostname to use in log events
            event_ids: Optional list of event IDs to filter (None = collect all)
            poll_interval: Seconds between polling cycles
            batch_size: Maximum events to read per channel per poll
            on_event: Callback for each log event
        """
        if not HAS_PYWIN32:
            raise ImportError(
                "pywin32 is required for Windows Event collection. "
                "Install it with: pip install pywin32"
            )

        self.channels = channels
        self.hostname = hostname
        self.event_ids = set(event_ids) if event_ids else None
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self.on_event = on_event

        # Bookmark database
        bookmark_path = Config.get_data_dir() / "windows_events_bookmarks.db"
        self.bookmarks = EventBookmark(bookmark_path)

        # State
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Stats
        self._events_collected = 0
        self._events_filtered = 0

    def start(self) -> None:
        """Start the collector."""
        if self._running:
            logger.warning("Windows Event collector already running")
            return

        if not self.channels:
            logger.warning("No channels configured for Windows Event collection")
            return

        self._stop_event.clear()
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(f"Windows Event collector started for channels: {', '.join(self.channels)}")
        if self.event_ids:
            logger.info(f"Filtering for event IDs: {sorted(self.event_ids)}")

    def stop(self) -> None:
        """Stop the collector."""
        if not self._running:
            return

        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10.0)
            self._thread = None

        self._running = False
        logger.info("Windows Event collector stopped")
        logger.info(f"  Collected: {self._events_collected}, Filtered: {self._events_filtered}")

    def is_running(self) -> bool:
        """Check if the collector is running."""
        return self._running

    def _run_loop(self) -> None:
        """Main collection loop."""
        while not self._stop_event.is_set():
            try:
                for channel in self.channels:
                    events = self._collect_channel(channel)
                    for event in events:
                        if self.on_event:
                            self.on_event(event)
                        self._events_collected += 1

            except Exception as e:
                logger.error(f"Error in Windows Event collection loop: {e}", exc_info=True)

            # Wait for next poll
            self._stop_event.wait(timeout=self.poll_interval)

    def _collect_channel(self, channel: str) -> list[LogEvent]:
        """Collect events from a specific channel."""
        events = []

        try:
            # Open the event log
            hand = win32evtlog.OpenEventLog(None, channel)
            if not hand:
                logger.error(f"Failed to open event log: {channel}")
                return events

            try:
                # Get total number of records
                total = win32evtlog.GetNumberOfEventLogRecords(hand)

                # Get bookmark (last read record)
                bookmark = self.bookmarks.get_bookmark(channel)

                # If no bookmark, start from current position (don't read entire history)
                if bookmark is None:
                    # Get the oldest record number
                    oldest = win32evtlog.GetOldestEventLogRecord(hand)
                    # Start from most recent to avoid reading entire history on first run
                    bookmark = max(oldest, total - 100) if total > 100 else oldest
                    logger.info(f"No bookmark for {channel}, starting from record {bookmark}")

                # Read flags: sequential read, forward direction
                flags = win32evtlog.EVENTLOG_FORWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

                # Seek to bookmark position
                # Note: We need to read from the bookmark, but Win32 doesn't have direct seek
                # We'll read sequentially and skip events we've already processed

                events_read = 0
                last_record = bookmark

                while events_read < self.batch_size and not self._stop_event.is_set():
                    # Read next batch of events
                    raw_events = win32evtlog.ReadEventLog(hand, flags, 0)

                    if not raw_events:
                        break

                    for raw_event in raw_events:
                        record_number = raw_event.RecordNumber

                        # Skip events we've already processed
                        if record_number <= bookmark:
                            continue

                        # Filter by event ID if specified
                        event_id = raw_event.EventID & 0xFFFF  # Mask off top bits
                        if self.event_ids and event_id not in self.event_ids:
                            self._events_filtered += 1
                            last_record = max(last_record, record_number)
                            continue

                        # Convert to LogEvent
                        log_event = self._convert_event(raw_event, channel)
                        if log_event:
                            events.append(log_event)
                            events_read += 1

                        last_record = max(last_record, record_number)

                        if events_read >= self.batch_size:
                            break

                # Update bookmark
                if last_record > bookmark:
                    self.bookmarks.set_bookmark(channel, last_record)

            finally:
                win32evtlog.CloseEventLog(hand)

        except pywintypes.error as e:
            logger.error(f"Error reading {channel}: {e}")
        except Exception as e:
            logger.error(f"Unexpected error reading {channel}: {e}", exc_info=True)

        return events

    def _convert_event(self, raw_event, channel: str) -> Optional[LogEvent]:
        """Convert a Windows event to a LogEvent."""
        try:
            # Extract event data
            event_id = raw_event.EventID & 0xFFFF
            event_type = raw_event.EventType
            time_generated = raw_event.TimeGenerated
            source_name = raw_event.SourceName
            computer = raw_event.ComputerName

            # Get event message
            try:
                message = win32evtlogutil.SafeFormatMessage(raw_event, channel)
            except Exception:
                # Fallback if message formatting fails
                message = f"Event ID {event_id} from {source_name}"

            # Map event type to severity
            severity = EVENT_TYPE_MAP.get(event_type, "info")

            # Extract user SID if available
            user_sid = None
            if raw_event.Sid:
                try:
                    import win32security
                    user_sid = win32security.ConvertSidToStringSid(raw_event.Sid)
                except Exception:
                    pass

            # Build structured data
            structured_data = {
                "event_id": event_id,
                "provider": source_name,
                "channel": channel,
                "record_number": raw_event.RecordNumber,
                "event_type": event_type,
                "computer": computer,
            }

            if user_sid:
                structured_data["user_sid"] = user_sid

            # Add event category description for high-value events
            if event_id in HIGH_VALUE_EVENTS:
                structured_data["event_category"] = HIGH_VALUE_EVENTS[event_id]

            # Add string inserts (event-specific data)
            if raw_event.StringInserts:
                structured_data["event_data"] = list(raw_event.StringInserts)

            # Create LogEvent
            timestamp = time_generated.isoformat() if hasattr(time_generated, 'isoformat') else datetime.utcnow().isoformat()

            return LogEvent(
                timestamp=timestamp + "Z" if not timestamp.endswith("Z") else timestamp,
                hostname=self.hostname,
                source="lognog-in-winevents",
                source_type=f"windows_{channel.lower()}",
                file_path=f"EventLog://{channel}",
                message=message.strip() if message else f"Event {event_id}",
                metadata={
                    "severity": severity,
                    **structured_data,
                },
            )

        except Exception as e:
            logger.error(f"Error converting event: {e}", exc_info=True)
            return None

    def collect(self) -> list[LogEvent]:
        """
        Collect new events since last check (synchronous version).

        This is useful for one-off collection rather than continuous monitoring.
        """
        events = []
        for channel in self.channels:
            events.extend(self._collect_channel(channel))
        return events

    def get_stats(self) -> dict:
        """Get collector statistics."""
        return {
            "running": self._running,
            "channels": self.channels,
            "event_ids_filter": list(self.event_ids) if self.event_ids else None,
            "events_collected": self._events_collected,
            "events_filtered": self._events_filtered,
            "poll_interval": self.poll_interval,
        }
