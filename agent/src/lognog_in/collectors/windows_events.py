"""Windows Event Log collector using pywin32.

Two readers:

* **Modern** (``EvtQuery`` / ``EvtRender``, Windows Vista+): reads *every*
  channel — including ``Microsoft-Windows-Sysmon/Operational``,
  ``Microsoft-Windows-PowerShell/Operational``, ``…/TaskScheduler/Operational``
  — renders the event as XML and extracts the named ``EventData`` fields
  (``TargetUserName``, ``IpAddress``, ``CommandLine`` …) so LogNog can search
  ``user_name=bob`` instead of positional string inserts. Filtering by event
  ID happens inside the XPath query, server-side in the Event Log service.
* **Legacy** (``ReadEventLog``): classic Application/System/Security only;
  kept as the fallback for very old pywin32 builds.

Bookmarks are the ``EventRecordID`` per channel, persisted in SQLite.
"""

import logging
import os
import sqlite3
import threading
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager
from datetime import datetime, timezone
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

# Modern API availability (pywin32 >= 220 or so).
HAS_MODERN_API = HAS_PYWIN32 and all(
    hasattr(win32evtlog, name) for name in ("EvtQuery", "EvtNext", "EvtRender")
)

_NS = "{http://schemas.microsoft.com/win/2004/08/events/event}"

# Windows Event severity mapping (legacy EventType values)
EVENT_TYPE_MAP = {
    win32evtlog.EVENTLOG_ERROR_TYPE: "error",
    win32evtlog.EVENTLOG_WARNING_TYPE: "warning",
    win32evtlog.EVENTLOG_INFORMATION_TYPE: "info",
    win32evtlog.EVENTLOG_AUDIT_SUCCESS: "info",
    win32evtlog.EVENTLOG_AUDIT_FAILURE: "warning",
} if HAS_PYWIN32 else {}

# Modern API Level values
LEVEL_NAMES = {0: "info", 1: "critical", 2: "error", 3: "warning", 4: "info", 5: "debug"}
LEVEL_LABELS = {0: "LogAlways", 1: "Critical", 2: "Error", 3: "Warning", 4: "Information", 5: "Verbose"}
KEYWORD_AUDIT_FAILURE = 0x0010000000000000
KEYWORD_AUDIT_SUCCESS = 0x0020000000000000

# The Event Log service rejects very long XPath expressions; beyond this many
# IDs we filter client-side instead.
XPATH_MAX_IDS = 20

# Windows error codes
ERROR_NO_MORE_ITEMS = 259
ERROR_TIMEOUT = 1460
ERROR_ACCESS_DENIED = 5
ERROR_EVT_CHANNEL_NOT_FOUND = 15007
ERROR_EVT_INVALID_QUERY = 15001

# High-value security events
HIGH_VALUE_EVENTS = {
    1102: "Audit log cleared",
    4624: "Successful logon",
    4625: "Failed logon",
    4634: "Logoff",
    4648: "Explicit credential logon",
    4672: "Special privileges assigned",
    4688: "Process creation",
    4697: "Service installed (security)",
    4698: "Scheduled task created",
    4699: "Scheduled task deleted",
    4700: "Scheduled task enabled",
    4701: "Scheduled task disabled",
    4702: "Scheduled task updated",
    4719: "Audit policy changed",
    4720: "User account created",
    4722: "User account enabled",
    4723: "Password change attempt",
    4724: "Password reset attempt",
    4725: "User account disabled",
    4726: "User account deleted",
    4728: "Member added to security-enabled global group",
    4732: "Member added to security-enabled local group",
    4733: "Member removed from security-enabled local group",
    4738: "User account changed",
    4740: "User account locked out",
    4756: "Member added to security-enabled universal group",
    4757: "Member removed from security-enabled universal group",
    4768: "Kerberos TGT requested",
    4769: "Kerberos service ticket requested",
    4776: "NTLM credential validation",
    7034: "Service crashed",
    7036: "Service state changed",
    7040: "Service start type changed",
    7045: "Service installed",
    4104: "PowerShell script block",
    4103: "PowerShell module logging",
}

# Sysmon (Microsoft-Windows-Sysmon/Operational) event names.
SYSMON_EVENTS = {
    1: "Process create", 2: "File creation time changed", 3: "Network connection",
    5: "Process terminated", 6: "Driver loaded", 7: "Image loaded", 8: "CreateRemoteThread",
    10: "Process access", 11: "File created", 12: "Registry object added/deleted",
    13: "Registry value set", 15: "File stream created", 17: "Pipe created", 18: "Pipe connected",
    22: "DNS query", 23: "File delete (archived)", 25: "Process tampering", 26: "File delete",
}


def local_event_time_to_utc_iso(time_generated) -> str:
    """Convert a pywin32 event ``TimeGenerated`` (LOCAL time) to a UTC ISO string.

    pywin32 surfaces ``TimeGenerated`` as a naive local-time value. The old code
    took that value and appended "Z", falsely labelling local time as UTC — so
    every event was off by the machine's UTC offset. Here we interpret the value
    as local time using the actual system offset and convert to real UTC.

    Accepts a ``PyTime`` (has ``.timestamp()`` in modern pywin32), a naive
    ``datetime`` (assumed local), or an aware ``datetime`` (converted directly).
    Falls back to "now" in UTC if the value can't be interpreted.
    """
    try:
        # PyTime and datetime both support timestamp() in modern pywin32/py3.
        # For a naive/local datetime, timestamp() already interprets it as local
        # time, giving a correct POSIX timestamp we can render as UTC.
        if hasattr(time_generated, "timestamp"):
            ts = time_generated.timestamp()
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except (OSError, OverflowError, ValueError):
        pass

    # Fallback: aware datetime -> convert; anything else -> now.
    if isinstance(time_generated, datetime):
        if time_generated.tzinfo is not None:
            return time_generated.astimezone(timezone.utc).isoformat()
        # Naive datetime assumed local: attach local tz then convert.
        local_tz = datetime.now().astimezone().tzinfo
        return time_generated.replace(tzinfo=local_tz).astimezone(timezone.utc).isoformat()

    return datetime.now(timezone.utc).isoformat()


def normalize_system_time(value: Optional[str]) -> str:
    """``TimeCreated/@SystemTime`` (UTC, up to 7 fractional digits) -> ISO UTC.

    Python's ``fromisoformat`` accepts at most 6 fractional digits; Windows
    writes 7. Falls back to "now" when the value is missing or malformed.
    """
    if not value:
        return datetime.now(timezone.utc).isoformat()
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1]
    if "." in text:
        head, frac = text.split(".", 1)
        frac = "".join(ch for ch in frac if ch.isdigit())[:6]
        text = f"{head}.{frac}" if frac else head
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return datetime.now(timezone.utc).isoformat()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def severity_from_level(level: Optional[int], keywords: Optional[int] = None) -> str:
    """Map a modern-API Level (+ audit keywords) to a LogNog severity word."""
    if keywords is not None:
        if keywords & KEYWORD_AUDIT_FAILURE:
            return "warning"
        if keywords & KEYWORD_AUDIT_SUCCESS:
            return "info"
    if level is None:
        return "info"
    return LEVEL_NAMES.get(level, "info")


def build_xpath(
    after_record: Optional[int],
    event_ids: Optional[set[int]] = None,
    exclude_event_ids: Optional[set[int]] = None,
) -> str:
    """Build the XPath filter the Event Log service evaluates server-side.

    ``*[System[EventRecordID > N and (EventID=4624 or EventID=4625) and EventID!=5156]]``
    When the ID lists are too long for one expression they are left out and
    applied client-side by the collector.
    """
    conditions: list[str] = []
    if after_record is not None:
        conditions.append(f"EventRecordID > {int(after_record)}")
    if event_ids and len(event_ids) <= XPATH_MAX_IDS:
        ids = " or ".join(f"EventID={int(i)}" for i in sorted(event_ids))
        conditions.append(f"({ids})")
    if exclude_event_ids and len(exclude_event_ids) <= XPATH_MAX_IDS:
        conditions.extend(f"EventID!={int(i)}" for i in sorted(exclude_event_ids))
    if not conditions:
        return "*"
    return "*[System[" + " and ".join(conditions) + "]]"


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def parse_event_xml(xml_text: str) -> dict:
    """Parse an ``EvtRender`` XML document into a flat dict.

    System fields come back under their own names (``event_id``, ``level``,
    ``record_id`` …); ``EventData/Data[@Name]`` becomes ``event_data``
    (name -> value), unnamed ``Data`` elements a list under ``event_data.data``,
    and ``UserData`` children are flattened into ``user_data``.
    """
    root = ET.fromstring(xml_text)
    system = root.find(f"{_NS}System")
    out: dict = {}
    if system is not None:
        for child in system:
            name = _local_name(child.tag)
            text = (child.text or "").strip()
            if name == "Provider":
                out["provider"] = child.get("Name") or child.get("EventSourceName") or ""
                if child.get("Guid"):
                    out["provider_guid"] = child.get("Guid")
            elif name == "EventID":
                try:
                    out["event_id"] = int(text)
                except ValueError:
                    out["event_id"] = text
                if child.get("Qualifiers"):
                    out["qualifiers"] = child.get("Qualifiers")
            elif name in ("Version", "Level", "Task", "Opcode"):
                try:
                    out[name.lower()] = int(text)
                except ValueError:
                    out[name.lower()] = text
            elif name == "Keywords":
                out["keywords"] = text
            elif name == "TimeCreated":
                out["time_created"] = normalize_system_time(child.get("SystemTime"))
            elif name == "EventRecordID":
                try:
                    out["record_id"] = int(text)
                except ValueError:
                    out["record_id"] = text
            elif name == "Correlation":
                if child.get("ActivityID"):
                    out["activity_id"] = child.get("ActivityID")
            elif name == "Execution":
                if child.get("ProcessID"):
                    out["process_id"] = int(child.get("ProcessID"))
                if child.get("ThreadID"):
                    out["thread_id"] = int(child.get("ThreadID"))
            elif name == "Channel":
                out["channel"] = text
            elif name == "Computer":
                out["computer"] = text
            elif name == "Security":
                if child.get("UserID"):
                    out["user_sid"] = child.get("UserID")

    event_data: dict = {}
    unnamed: list[str] = []
    ed = root.find(f"{_NS}EventData")
    if ed is not None:
        for data in ed:
            value = (data.text or "").strip()
            key = data.get("Name")
            if key:
                event_data[key] = value
            elif _local_name(data.tag) == "Data":
                unnamed.append(value)
            elif _local_name(data.tag) == "Binary":
                event_data["Binary"] = value
    if unnamed:
        event_data["data"] = unnamed
    if event_data:
        out["event_data"] = event_data

    ud = root.find(f"{_NS}UserData")
    if ud is not None:
        user_data: dict = {}
        for wrapper in ud:
            for item in wrapper:
                user_data[_local_name(item.tag)] = (item.text or "").strip()
            if not len(wrapper):
                user_data[_local_name(wrapper.tag)] = (wrapper.text or "").strip()
        if user_data:
            out["user_data"] = user_data

    # Forwarded/rendered events may carry the formatted message inline.
    ri = root.find(f"{_NS}RenderingInfo")
    if ri is not None:
        msg = ri.find(f"{_NS}Message")
        if msg is not None and msg.text:
            out["rendered_message"] = msg.text.strip()

    return out


def synthesize_message(parsed: dict) -> str:
    """Readable fallback when the provider's message table isn't available."""
    event_id = parsed.get("event_id", "?")
    provider = parsed.get("provider", "")
    category = HIGH_VALUE_EVENTS.get(event_id) if isinstance(event_id, int) else None
    if isinstance(event_id, int) and "Sysmon" in provider:
        category = SYSMON_EVENTS.get(event_id, category)
    head = f"Event {event_id}" + (f" ({category})" if category else "") + (f" from {provider}" if provider else "")
    data = parsed.get("event_data") or {}
    pairs = [f"{k}={v}" for k, v in data.items() if k != "data" and v and len(str(v)) <= 120]
    if pairs:
        return head + ": " + ", ".join(pairs[:12])
    return head


def detect_record_reset(bookmark: Optional[int], oldest: int, total: int) -> Optional[int]:
    """Detect a Windows event-log clear/wrap and return a corrected bookmark.

    After the log is cleared (or wraps), record numbers restart low, so the
    newest record number can fall below a previously-stored bookmark and new
    records would be silently skipped. When that happens, return a reset
    bookmark (just before the new oldest record); otherwise return ``bookmark``
    unchanged.

    Args:
        bookmark: Previously stored bookmark, or None if never read.
        oldest: Oldest record number currently in the log.
        total: Total number of records currently in the log.
    """
    if bookmark is None or total <= 0:
        return bookmark
    newest = oldest + total - 1
    if newest < bookmark:
        return max(oldest - 1, 0)
    return bookmark


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
                    (channel, record_number, datetime.now(timezone.utc).isoformat())
                )
                conn.commit()


class WindowsEventCollector:
    """
    Collects Windows Event Logs using pywin32.

    Features:
    - Collects from multiple channels (Security, System, Application, and any
      modern channel such as Sysmon / PowerShell / TaskScheduler)
    - Event ID include/exclude filtering (in the query when possible)
    - Named EventData fields, provider, level, keywords, task, opcode
    - Bookmark persistence to avoid re-reading
    - Efficient batch reading
    - Graceful fallback to the legacy API / if pywin32 not available
    """

    def __init__(
        self,
        channels: list[str],
        hostname: str,
        event_ids: Optional[list[int]] = None,
        poll_interval: int = 10,
        batch_size: int = 100,
        on_event: Optional[Callable[[LogEvent], None]] = None,
        exclude_event_ids: Optional[list[int]] = None,
        api: str = "auto",
        index: Optional[str] = None,
        on_batch: Optional[Callable[[list[LogEvent]], None]] = None,
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
            exclude_event_ids: Event IDs to drop
            api: "auto" | "modern" | "legacy"
            index: LogNog index for these events (None = server default)
            on_batch: Callback receiving all events of one poll (preferred)
        """
        if not HAS_PYWIN32:
            raise ImportError(
                "pywin32 is required for Windows Event collection. "
                "Install it with: pip install pywin32"
            )

        self.channels = channels
        self.hostname = hostname
        self.event_ids = set(event_ids) if event_ids else None
        self.exclude_event_ids = set(exclude_event_ids) if exclude_event_ids else None
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self.on_event = on_event
        self.on_batch = on_batch
        self.index = index
        self.api = api if api in ("auto", "modern", "legacy") else "auto"
        self._use_modern = HAS_MODERN_API and self.api != "legacy"
        if self.api == "modern" and not HAS_MODERN_API:
            logger.warning("Modern Event Log API not available in this pywin32; using legacy reader")

        # Bookmark database
        bookmark_path = Config.get_data_dir() / "windows_events_bookmarks.db"
        self.bookmarks = EventBookmark(bookmark_path)

        # State
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._publisher_cache: dict[str, object] = {}
        self._channel_errors: dict[str, str] = {}
        self._warned_channels: set[str] = set()

        # Stats
        self._events_collected = 0
        self._events_filtered = 0
        self._polls = 0
        self._last_poll_time: Optional[float] = None

    # ------------------------------------------------------------ lifecycle
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
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="lognog-winevt")
        self._thread.start()
        logger.info(
            f"Windows Event collector started ({'modern' if self._use_modern else 'legacy'} API) "
            f"for channels: {', '.join(self.channels)}"
        )
        if self.event_ids:
            logger.info(f"Filtering for event IDs: {sorted(self.event_ids)}")
        if self.exclude_event_ids:
            logger.info(f"Excluding event IDs: {sorted(self.exclude_event_ids)}")

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
                    if not events:
                        continue
                    if self.on_batch is not None:
                        self.on_batch(events)
                    elif self.on_event:
                        for event in events:
                            self.on_event(event)
                    self._events_collected += len(events)
                self._polls += 1
                self._last_poll_time = time.time()

            except Exception as e:
                logger.error(f"Error in Windows Event collection loop: {e}", exc_info=True)

            # Wait for next poll
            self._stop_event.wait(timeout=self.poll_interval)

    def _passes_filters(self, event_id) -> bool:
        if not isinstance(event_id, int):
            return True
        if self.event_ids and event_id not in self.event_ids:
            return False
        if self.exclude_event_ids and event_id in self.exclude_event_ids:
            return False
        return True

    def _collect_channel(self, channel: str) -> list[LogEvent]:
        """Collect events from a specific channel (modern API first)."""
        if self._use_modern:
            try:
                return self._collect_channel_modern(channel)
            except pywintypes.error as e:
                winerror = getattr(e, "winerror", None)
                if winerror in (ERROR_ACCESS_DENIED, ERROR_EVT_CHANNEL_NOT_FOUND, ERROR_EVT_INVALID_QUERY):
                    self._note_channel_error(channel, f"{e.strerror} (error {winerror})")
                    return []
                logger.error(f"Modern API failed on {channel}: {e}")
                return []
        return self._collect_channel_legacy(channel)

    def _note_channel_error(self, channel: str, message: str) -> None:
        self._channel_errors[channel] = message
        if channel not in self._warned_channels:
            self._warned_channels.add(channel)
            hint = ""
            if "denied" in message.lower():
                hint = " — run the agent as a service (LocalSystem) or as Administrator"
            elif "not found" in message.lower() or "15007" in message:
                hint = " — check the channel name (as shown in Event Viewer)"
            logger.warning(f"Cannot read channel {channel}: {message}{hint}")

    # ---------------------------------------------------------- modern API
    def _newest_record_id(self, channel: str) -> Optional[int]:
        """EventRecordID of the newest record in the channel (None if empty)."""
        flags = win32evtlog.EvtQueryChannelPath | win32evtlog.EvtQueryReverseDirection
        handle = win32evtlog.EvtQuery(channel, flags, "*")
        events = self._evt_next(handle, 1)
        if not events:
            return None
        parsed = parse_event_xml(win32evtlog.EvtRender(events[0], win32evtlog.EvtRenderEventXml))
        rid = parsed.get("record_id")
        return rid if isinstance(rid, int) else None

    @staticmethod
    def _evt_next(handle, count: int, timeout_ms: int = 500):
        """EvtNext that returns an empty tuple instead of raising at the end."""
        try:
            return win32evtlog.EvtNext(handle, count, timeout_ms, 0)
        except pywintypes.error as e:
            if getattr(e, "winerror", None) in (ERROR_NO_MORE_ITEMS, ERROR_TIMEOUT):
                return ()
            raise

    def _collect_channel_modern(self, channel: str) -> list[LogEvent]:
        events: list[LogEvent] = []
        bookmark = self.bookmarks.get_bookmark(channel)

        if bookmark is None:
            # First run: don't replay history — start just behind the newest record.
            newest = self._newest_record_id(channel)
            bookmark = max(0, (newest or 0) - 100)
            logger.info(f"No bookmark for {channel}, starting from record {bookmark}")

        query = build_xpath(bookmark, self.event_ids, self.exclude_event_ids)
        flags = win32evtlog.EvtQueryChannelPath | win32evtlog.EvtQueryForwardDirection
        handle = win32evtlog.EvtQuery(channel, flags, query)

        last_record = bookmark
        while len(events) < self.batch_size and not self._stop_event.is_set():
            chunk = self._evt_next(handle, min(50, self.batch_size - len(events)))
            if not chunk:
                break
            for evt in chunk:
                try:
                    xml_text = win32evtlog.EvtRender(evt, win32evtlog.EvtRenderEventXml)
                    parsed = parse_event_xml(xml_text)
                except Exception as e:
                    logger.debug(f"Could not render event on {channel}: {e}")
                    continue
                rid = parsed.get("record_id")
                if isinstance(rid, int):
                    last_record = max(last_record, rid)
                if not self._passes_filters(parsed.get("event_id")):
                    self._events_filtered += 1
                    continue
                log_event = self._convert_modern(parsed, evt, channel)
                if log_event:
                    events.append(log_event)

        if last_record > bookmark:
            self.bookmarks.set_bookmark(channel, last_record)
        self._channel_errors.pop(channel, None)
        return events

    def _format_message(self, provider: str, evt) -> Optional[str]:
        """Render the provider's message for an event; None when unavailable."""
        if not provider or not hasattr(win32evtlog, "EvtFormatMessage"):
            return None
        if provider in self._publisher_cache:
            metadata = self._publisher_cache[provider]
        else:
            try:
                metadata = win32evtlog.EvtOpenPublisherMetadata(provider)
            except Exception:
                metadata = None
            self._publisher_cache[provider] = metadata
        if metadata is None:
            return None
        try:
            text = win32evtlog.EvtFormatMessage(metadata, evt, win32evtlog.EvtFormatMessageEvent)
        except Exception:
            return None
        return text.strip() if text else None

    def _convert_modern(self, parsed: dict, evt, channel: str) -> Optional[LogEvent]:
        try:
            event_id = parsed.get("event_id")
            provider = parsed.get("provider", "")
            level = parsed.get("level")
            keywords_raw = parsed.get("keywords")
            keywords_int: Optional[int] = None
            if isinstance(keywords_raw, str) and keywords_raw.startswith("0x"):
                try:
                    keywords_int = int(keywords_raw, 16)
                except ValueError:
                    keywords_int = None
            severity = severity_from_level(level, keywords_int)

            message = parsed.get("rendered_message") or self._format_message(provider, evt) or synthesize_message(parsed)

            structured: dict = {
                "severity": severity,
                "event_id": event_id,
                "provider": provider,
                "channel": parsed.get("channel") or channel,
                "record_number": parsed.get("record_id"),
                "computer": parsed.get("computer"),
                "level": level,
                "level_name": LEVEL_LABELS.get(level, str(level)) if level is not None else None,
            }
            for key in ("provider_guid", "version", "task", "opcode", "keywords", "activity_id",
                        "process_id", "thread_id", "user_sid", "qualifiers"):
                if parsed.get(key) is not None:
                    structured[key] = parsed[key]
            if keywords_int is not None:
                if keywords_int & KEYWORD_AUDIT_FAILURE:
                    structured["audit"] = "failure"
                elif keywords_int & KEYWORD_AUDIT_SUCCESS:
                    structured["audit"] = "success"
            if isinstance(event_id, int):
                category = HIGH_VALUE_EVENTS.get(event_id)
                if "Sysmon" in provider:
                    category = SYSMON_EVENTS.get(event_id, category)
                if category:
                    structured["event_category"] = category
            if parsed.get("event_data"):
                structured["event_data"] = parsed["event_data"]
            if parsed.get("user_data"):
                structured["user_data"] = parsed["user_data"]

            structured = {k: v for k, v in structured.items() if v is not None}
            channel_slug = (parsed.get("channel") or channel).lower().replace("/", "_").replace("-", "_")

            return LogEvent(
                timestamp=parsed.get("time_created") or datetime.now(timezone.utc).isoformat(),
                hostname=self.hostname,
                source="lognog-in-winevents",
                source_type=f"windows_{channel_slug}",
                file_path=f"EventLog://{parsed.get('channel') or channel}",
                message=message or f"Event {event_id}",
                metadata=structured,
                index=self.index,
            )
        except Exception as e:
            logger.error(f"Error converting event: {e}", exc_info=True)
            return None

    # ---------------------------------------------------------- legacy API
    def _collect_channel_legacy(self, channel: str) -> list[LogEvent]:
        """Collect events from a specific channel with the classic API."""
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

                # Oldest record currently in the log.
                oldest = win32evtlog.GetOldestEventLogRecord(hand)

                # Detect a record-number reset (log cleared/wrapped) so new
                # low-numbered records aren't silently skipped past the bookmark.
                reset_bookmark = detect_record_reset(bookmark, oldest, total)
                if reset_bookmark != bookmark:
                    logger.warning(
                        f"Record-number reset detected on {channel} "
                        f"(oldest={oldest}, total={total}, bookmark={bookmark}); "
                        f"resetting bookmark to {reset_bookmark}"
                    )
                    bookmark = reset_bookmark

                # If no bookmark, start from current position (don't read entire history)
                if bookmark is None:
                    # Start from most recent to avoid reading entire history on first run
                    bookmark = max(oldest, total - 100) if total > 100 else oldest
                    logger.info(f"No bookmark for {channel}, starting from record {bookmark}")

                # Seek directly to the record AFTER the bookmark instead of
                # re-scanning the whole log from the start on every poll. The
                # first read uses EVENTLOG_SEEK_READ to jump to (bookmark + 1);
                # subsequent reads in this poll continue with SEQUENTIAL_READ.
                base_flags = win32evtlog.EVENTLOG_FORWARDS_READ
                seek_offset = bookmark + 1
                # Guard: never seek before the oldest available record.
                if seek_offset < oldest:
                    seek_offset = oldest

                events_read = 0
                last_record = bookmark
                first_read = True

                while events_read < self.batch_size and not self._stop_event.is_set():
                    try:
                        if first_read:
                            flags = base_flags | win32evtlog.EVENTLOG_SEEK_READ
                            raw_events = win32evtlog.ReadEventLog(hand, flags, seek_offset)
                            first_read = False
                        else:
                            flags = base_flags | win32evtlog.EVENTLOG_SEQUENTIAL_READ
                            raw_events = win32evtlog.ReadEventLog(hand, flags, 0)
                    except pywintypes.error as e:
                        # EOF / invalid offset just means there's nothing new past
                        # the bookmark this poll. Any other error is logged above.
                        winerror = getattr(e, "winerror", None)
                        if winerror in (38, 87):  # ERROR_HANDLE_EOF, ERROR_INVALID_PARAMETER
                            break
                        raise

                    if not raw_events:
                        break

                    for raw_event in raw_events:
                        record_number = raw_event.RecordNumber

                        # Defensive: skip anything at/under the bookmark (can
                        # happen right at the seek boundary).
                        if record_number <= bookmark:
                            continue

                        # Filter by event ID if specified
                        event_id = raw_event.EventID & 0xFFFF  # Mask off top bits
                        if not self._passes_filters(event_id):
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
            self._note_channel_error(channel, str(e))
        except Exception as e:
            logger.error(f"Unexpected error reading {channel}: {e}", exc_info=True)

        return events

    def _convert_event(self, raw_event, channel: str) -> Optional[LogEvent]:
        """Convert a legacy-API Windows event to a LogEvent."""
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

            # Convert the LOCAL TimeGenerated to a correct UTC ISO timestamp.
            # (The old code appended "Z" to a local time, mislabelling it.)
            timestamp = local_event_time_to_utc_iso(time_generated)

            return LogEvent(
                timestamp=timestamp,
                hostname=self.hostname,
                source="lognog-in-winevents",
                source_type=f"windows_{channel.lower()}",
                file_path=f"EventLog://{channel}",
                message=message.strip() if message else f"Event {event_id}",
                metadata={
                    "severity": severity,
                    **structured_data,
                },
                index=self.index,
            )

        except Exception as e:
            logger.error(f"Error converting event: {e}", exc_info=True)
            return None

    # ------------------------------------------------------------- helpers
    def collect(self) -> list[LogEvent]:
        """
        Collect new events since last check (synchronous version).

        This is useful for one-off collection rather than continuous monitoring.
        """
        events = []
        for channel in self.channels:
            events.extend(self._collect_channel(channel))
        return events

    @staticmethod
    def check_channel(channel: str) -> tuple[bool, str]:
        """Probe one channel with the modern API. Returns (ok, detail)."""
        if not HAS_MODERN_API:
            return False, "modern Event Log API unavailable"
        try:
            flags = win32evtlog.EvtQueryChannelPath | win32evtlog.EvtQueryReverseDirection
            handle = win32evtlog.EvtQuery(channel, flags, "*")
            events = WindowsEventCollector._evt_next(handle, 1)
            if not events:
                return True, "readable (empty)"
            parsed = parse_event_xml(win32evtlog.EvtRender(events[0], win32evtlog.EvtRenderEventXml))
            return True, f"readable, newest record {parsed.get('record_id')} at {parsed.get('time_created')}"
        except pywintypes.error as e:
            return False, f"{e.strerror} (error {getattr(e, 'winerror', '?')})"
        except Exception as e:
            return False, str(e)

    def get_stats(self) -> dict:
        """Get collector statistics."""
        return {
            "running": self._running,
            "api": "modern" if self._use_modern else "legacy",
            "channels": self.channels,
            "event_ids_filter": sorted(self.event_ids) if self.event_ids else None,
            "exclude_event_ids": sorted(self.exclude_event_ids) if self.exclude_event_ids else None,
            "events_collected": self._events_collected,
            "events_filtered": self._events_filtered,
            "polls": self._polls,
            "last_poll_time": self._last_poll_time,
            "channel_errors": dict(self._channel_errors),
            "poll_interval": self.poll_interval,
        }
