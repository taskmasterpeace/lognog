"""Configuration management for LogNog In agent."""

import os
import re
import sys
import yaml
from pathlib import Path
from dataclasses import dataclass, field, fields as dataclass_fields
from typing import Optional
import appdirs


APP_NAME = "lognog-in"
APP_AUTHOR = "MachineKingLabs"

# Index names the server accepts (mirrors the API's index-name rule).
INDEX_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]{0,63}$")


def _filter_fields(raw: dict, cls, section: str) -> dict:
    """Drop unknown keys from a config dict so a typo doesn't crash agent startup."""
    valid = set(getattr(cls, "__dataclass_fields__", {}))
    unknown = [k for k in raw if k not in valid]
    if unknown:
        print(f"[lognog-in] Warning: ignoring unknown {section} keys: {', '.join(unknown)}")
    return {k: v for k, v in raw.items() if k in valid}


def normalize_index_name(value) -> Optional[str]:
    """Return a valid, lower-cased index name or None."""
    if not isinstance(value, str):
        return None
    name = value.strip().lower()
    return name if INDEX_NAME_RE.match(name) else None


@dataclass
class WatchPath:
    """A path to watch for log files.

    Splunk-style per-input settings live here so one agent can tail very
    different files with the right treatment for each:

    - ``exclude``: glob patterns (matched against the file name and the full
      path) that are never tailed, e.g. ``["*.gz", "*.zip", "*-old.log"]``.
    - ``encoding``: text encoding of the file (``utf-8`` default; ``utf-16``,
      ``cp1252`` … for Windows-native logs). Undecodable bytes are replaced.
    - ``start_position``: ``end`` (default) ignores whatever a file already
      contains when the agent first sees it and ships only new lines — so
      pointing the agent at a 2 GB IIS log does not replay history.
      ``beginning`` ingests the whole file once.
    - ``multiline_pattern``: a regex that marks the START of an event; lines
      that don't match are appended to the previous event (stack traces,
      Java/.NET exceptions, multi-line JSON).
    - ``index``: LogNog index to store these events in (defaults to the
      agent-wide ``index``, then the server default ``agent``).
    - ``source_type``: label stored with every event (``file`` default;
      e.g. ``iis``, ``nginx_access``) so extractions can key off it.
    """
    path: str
    pattern: str = "*"
    recursive: bool = True
    enabled: bool = True
    exclude: list[str] = field(default_factory=list)
    encoding: str = "utf-8"
    start_position: str = "end"
    multiline_pattern: Optional[str] = None
    index: Optional[str] = None
    source_type: str = "file"

    def __post_init__(self) -> None:
        if not isinstance(self.exclude, list):
            self.exclude = [self.exclude] if isinstance(self.exclude, str) and self.exclude else []
        self.exclude = [str(e) for e in self.exclude if e]
        if not isinstance(self.encoding, str) or not self.encoding:
            self.encoding = "utf-8"
        if self.start_position not in ("end", "beginning"):
            self.start_position = "end"
        if self.multiline_pattern is not None:
            if not isinstance(self.multiline_pattern, str) or not self.multiline_pattern:
                self.multiline_pattern = None
            else:
                try:
                    re.compile(self.multiline_pattern)
                except re.error as e:
                    print(f"[lognog-in] Warning: invalid multiline_pattern for {self.path}: {e}; ignoring")
                    self.multiline_pattern = None
        self.index = normalize_index_name(self.index)
        if not isinstance(self.source_type, str) or not self.source_type.strip():
            self.source_type = "file"

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "pattern": self.pattern,
            "recursive": self.recursive,
            "enabled": self.enabled,
            "exclude": list(self.exclude),
            "encoding": self.encoding,
            "start_position": self.start_position,
            "multiline_pattern": self.multiline_pattern,
            "index": self.index,
            "source_type": self.source_type,
        }


@dataclass
class FIMPath:
    """A path to monitor for file integrity."""
    path: str
    pattern: str = "*"
    recursive: bool = True
    enabled: bool = True


@dataclass
class WindowsEventsConfig:
    """Configuration for Windows Event Log collection.

    ``api`` selects the reader: ``auto`` (default) uses the modern Windows
    Event Log API (``EvtQuery``) which can read every channel — including
    ``Microsoft-Windows-Sysmon/Operational`` and
    ``Microsoft-Windows-PowerShell/Operational`` — and returns named event
    fields; it falls back to the legacy ``ReadEventLog`` API (classic
    Application/System/Security only) when the modern API is unavailable.
    ``exclude_event_ids`` drops noisy IDs (e.g. 4662/5156) without having to
    enumerate every ID you do want.
    """
    enabled: bool = False
    channels: list[str] = field(default_factory=lambda: ["Security", "System", "Application"])
    event_ids: Optional[list[int]] = None  # None = collect all events
    exclude_event_ids: Optional[list[int]] = None
    poll_interval: int = 10  # seconds
    api: str = "auto"  # auto | modern | legacy
    index: Optional[str] = None
    batch_size: int = 200  # max events read per channel per poll

    def __post_init__(self) -> None:
        if not isinstance(self.channels, list):
            self.channels = [self.channels] if isinstance(self.channels, str) else []
        self.channels = [str(c).strip() for c in self.channels if str(c).strip()]
        self.event_ids = _int_list_or_none(self.event_ids)
        self.exclude_event_ids = _int_list_or_none(self.exclude_event_ids)
        if self.api not in ("auto", "modern", "legacy"):
            self.api = "auto"
        self.index = normalize_index_name(self.index)
        if not isinstance(self.batch_size, int) or self.batch_size < 1:
            self.batch_size = 200
        if not isinstance(self.poll_interval, int) or self.poll_interval < 1:
            self.poll_interval = 10

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "channels": list(self.channels),
            "event_ids": self.event_ids,
            "exclude_event_ids": self.exclude_event_ids,
            "poll_interval": self.poll_interval,
            "api": self.api,
            "index": self.index,
            "batch_size": self.batch_size,
        }


def _int_list_or_none(value) -> Optional[list[int]]:
    if value is None:
        return None
    if isinstance(value, int):
        return [value]
    if not isinstance(value, list):
        return None
    out: list[int] = []
    for v in value:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return out or None


# Keys that are parsed by hand in Config.load (nested structures / secrets).
_SPECIAL_KEYS = {"watch_paths", "fim_paths", "windows_events", "api_key", "api_key_protected"}


@dataclass
class Config:
    """Agent configuration."""
    # Server connection
    server_url: str = "http://localhost:4000"
    api_key: str = ""

    # Watch paths for log files
    watch_paths: list[WatchPath] = field(default_factory=list)

    # FIM paths
    fim_paths: list[FIMPath] = field(default_factory=list)
    fim_enabled: bool = False

    # Windows Event Log collection
    windows_events: WindowsEventsConfig = field(default_factory=WindowsEventsConfig)

    # Agent settings
    hostname: str = field(default_factory=lambda: os.uname().nodename if hasattr(os, 'uname') else os.environ.get('COMPUTERNAME', 'unknown'))
    batch_size: int = 100
    batch_interval_seconds: float = 5.0
    retry_max_attempts: int = 5
    retry_backoff_seconds: float = 2.0
    retry_backoff_max_seconds: float = 60.0

    # Buffer capacity caps (oldest-drop when exceeded). 0/unset uses defaults.
    buffer_max_rows: int = 500_000
    buffer_max_bytes: int = 512 * 1024 * 1024

    # Routing / enrichment. ``tags`` are static key/value pairs stamped onto
    # every event's structured data (environment=prod, role=web, …); ``index``
    # is the default LogNog index for file events (server default: agent).
    tags: dict = field(default_factory=dict)
    index: Optional[str] = None

    # Transport. ``verify_tls`` false accepts self-signed certificates;
    # ``ca_bundle`` points at a PEM file for a private CA (preferred).
    # ``compress_payloads`` gzips batches (>1 KB) — 5-10x less bandwidth.
    verify_tls: bool = True
    ca_bundle: Optional[str] = None
    compress_payloads: bool = True

    # Self-monitoring: one ``agent_heartbeat`` event every N seconds carrying
    # the shipper/collector counters so the server can alert on a dead agent.
    # 0 disables.
    heartbeat_interval_seconds: int = 60

    # File tailing safety net: every N seconds re-scan watched folders and
    # pick up changes the OS watcher missed (SMB shares, some containers).
    # 0 disables.
    scan_interval_seconds: int = 10

    # Store the API key DPAPI-encrypted (Windows only; machine scope so the
    # service and the tray app can both read it).
    protect_api_key: bool = True

    # Behavior
    start_on_boot: bool = False
    send_hostname: bool = True
    debug_logging: bool = False

    # Sound alerts
    sound_alerts_enabled: bool = False
    sound_critical: str = "default"
    sound_error: str = "default"
    sound_warning: str = "default"
    sound_info: str = "default"
    sound_volume: int = 100

    # Internal: track where config was loaded from
    _config_path: Optional[Path] = field(default=None, repr=False)

    # Wizard state tracking
    _wizard_completed: bool = field(default=False, repr=False)
    _wizard_skipped: bool = field(default=False, repr=False)

    def __post_init__(self) -> None:
        """Validate / clamp numeric settings and normalize the server URL.

        Rejecting bad values here rather than at use-site means one place is
        responsible for keeping the agent from busy-looping (poll_interval=0)
        or discarding data (batch_size=0), and from emitting `//api/...` URLs.
        """
        self.normalize()

    def normalize(self) -> None:
        """Clamp out-of-range settings to safe values and tidy the URL."""
        # Strip trailing slashes so f"{server_url}/api/..." never doubles up.
        if isinstance(self.server_url, str):
            self.server_url = self.server_url.strip().rstrip("/")

        # batch_size: at least 1 event per batch.
        if not isinstance(self.batch_size, int) or self.batch_size < 1:
            self.batch_size = 1

        # batch_interval: must be strictly positive to avoid a hot loop.
        try:
            self.batch_interval_seconds = float(self.batch_interval_seconds)
        except (TypeError, ValueError):
            self.batch_interval_seconds = 5.0
        if self.batch_interval_seconds <= 0:
            self.batch_interval_seconds = 5.0

        # retry backoff base / cap.
        try:
            self.retry_backoff_seconds = float(self.retry_backoff_seconds)
        except (TypeError, ValueError):
            self.retry_backoff_seconds = 2.0
        if self.retry_backoff_seconds <= 0:
            self.retry_backoff_seconds = 2.0
        try:
            self.retry_backoff_max_seconds = float(self.retry_backoff_max_seconds)
        except (TypeError, ValueError):
            self.retry_backoff_max_seconds = 60.0
        if self.retry_backoff_max_seconds < self.retry_backoff_seconds:
            self.retry_backoff_max_seconds = max(self.retry_backoff_seconds, 60.0)

        # retry_max_attempts: at least 1.
        if not isinstance(self.retry_max_attempts, int) or self.retry_max_attempts < 1:
            self.retry_max_attempts = 5

        # Buffer caps: fall back to defaults if non-positive.
        if not isinstance(self.buffer_max_rows, int) or self.buffer_max_rows < 1:
            self.buffer_max_rows = 500_000
        if not isinstance(self.buffer_max_bytes, int) or self.buffer_max_bytes < 1:
            self.buffer_max_bytes = 512 * 1024 * 1024

        # Windows Events poll interval: at least 1 second.
        we = getattr(self, "windows_events", None)
        if we is not None:
            if not isinstance(we.poll_interval, int) or we.poll_interval < 1:
                we.poll_interval = 10

        # Tags: flat string -> string map only.
        if not isinstance(self.tags, dict):
            self.tags = {}
        self.tags = {
            str(k): (v if isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in self.tags.items()
            if str(k).strip()
        }
        self.index = normalize_index_name(self.index)

        # Intervals: non-negative ints (0 = disabled).
        self.heartbeat_interval_seconds = _non_negative_int(self.heartbeat_interval_seconds, 60)
        self.scan_interval_seconds = _non_negative_int(self.scan_interval_seconds, 10)

        if self.ca_bundle is not None and not (isinstance(self.ca_bundle, str) and self.ca_bundle.strip()):
            self.ca_bundle = None
        self.verify_tls = bool(self.verify_tls)
        self.compress_payloads = bool(self.compress_payloads)
        self.protect_api_key = bool(self.protect_api_key)

    @classmethod
    def get_config_dir(cls) -> Path:
        """Get the configuration directory."""
        return Path(appdirs.user_config_dir(APP_NAME, APP_AUTHOR))

    @classmethod
    def get_data_dir(cls) -> Path:
        """Get the data directory (for databases)."""
        return Path(appdirs.user_data_dir(APP_NAME, APP_AUTHOR))

    @classmethod
    def get_log_dir(cls) -> Path:
        """Get the log directory."""
        return Path(appdirs.user_log_dir(APP_NAME, APP_AUTHOR))

    @classmethod
    def get_config_path(cls) -> Path:
        """Get the path to the config file."""
        return cls.get_config_dir() / "config.yaml"

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Config":
        """Load configuration from file."""
        config_path = path or cls.get_config_path()

        if not config_path.exists():
            return cls()

        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        if not isinstance(data, dict):
            print(f"[lognog-in] Warning: {config_path} is not a mapping; using defaults")
            data = {}

        # Parse watch paths
        watch_paths = []
        for wp in data.get("watch_paths", []) or []:
            if isinstance(wp, str):
                watch_paths.append(WatchPath(path=wp))
            elif isinstance(wp, dict):
                watch_paths.append(WatchPath(**_filter_fields(wp, WatchPath, "watch_paths")))

        # Parse FIM paths
        fim_paths = []
        for fp in data.get("fim_paths", []) or []:
            if isinstance(fp, str):
                fim_paths.append(FIMPath(path=fp))
            elif isinstance(fp, dict):
                fim_paths.append(FIMPath(**_filter_fields(fp, FIMPath, "fim_paths")))

        # Parse Windows Events config
        windows_events_data = data.get("windows_events", {})
        if isinstance(windows_events_data, dict):
            windows_events = WindowsEventsConfig(
                **_filter_fields(windows_events_data, WindowsEventsConfig, "windows_events")
            )
        else:
            windows_events = WindowsEventsConfig()

        # API key: a DPAPI-protected value takes precedence over plaintext.
        api_key = data.get("api_key") or ""
        protected = data.get("api_key_protected")
        if protected:
            from .secrets import unprotect_secret
            recovered = unprotect_secret(protected)
            if recovered:
                api_key = recovered
            elif not api_key:
                print(
                    "[lognog-in] Warning: could not decrypt api_key_protected "
                    "(config copied from another machine?). Re-enter the API key."
                )

        # Every other top-level key maps straight onto a dataclass field.
        valid = {f.name for f in dataclass_fields(cls)} - _SPECIAL_KEYS
        plain = {k: v for k, v in data.items() if k in valid}
        unknown = [k for k in data if k not in valid and k not in _SPECIAL_KEYS]
        if unknown:
            print(f"[lognog-in] Warning: ignoring unknown config keys: {', '.join(unknown)}")

        config = cls(
            api_key=api_key if isinstance(api_key, str) else "",
            watch_paths=watch_paths,
            fim_paths=fim_paths,
            windows_events=windows_events,
            _config_path=config_path,
            **plain,
        )
        return config

    def save(self, path: Optional[Path] = None) -> None:
        """Save configuration to file."""
        config_path = path or self.get_config_path()
        config_path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "server_url": self.server_url,
            "api_key": self.api_key,
            "watch_paths": [wp.to_dict() for wp in self.watch_paths],
            "fim_paths": [
                {
                    "path": fp.path,
                    "pattern": fp.pattern,
                    "recursive": fp.recursive,
                    "enabled": fp.enabled,
                }
                for fp in self.fim_paths
            ],
            "fim_enabled": self.fim_enabled,
            "windows_events": self.windows_events.to_dict(),
            "hostname": self.hostname,
            "batch_size": self.batch_size,
            "batch_interval_seconds": self.batch_interval_seconds,
            "retry_max_attempts": self.retry_max_attempts,
            "retry_backoff_seconds": self.retry_backoff_seconds,
            "retry_backoff_max_seconds": self.retry_backoff_max_seconds,
            "buffer_max_rows": self.buffer_max_rows,
            "buffer_max_bytes": self.buffer_max_bytes,
            "tags": dict(self.tags),
            "index": self.index,
            "verify_tls": self.verify_tls,
            "ca_bundle": self.ca_bundle,
            "compress_payloads": self.compress_payloads,
            "heartbeat_interval_seconds": self.heartbeat_interval_seconds,
            "scan_interval_seconds": self.scan_interval_seconds,
            "protect_api_key": self.protect_api_key,
            "start_on_boot": self.start_on_boot,
            "send_hostname": self.send_hostname,
            "debug_logging": self.debug_logging,
            "sound_alerts_enabled": self.sound_alerts_enabled,
            "sound_critical": self.sound_critical,
            "sound_error": self.sound_error,
            "sound_warning": self.sound_warning,
            "sound_info": self.sound_info,
            "sound_volume": self.sound_volume,
            "_wizard_completed": self._wizard_completed,
            "_wizard_skipped": self._wizard_skipped,
        }

        # Keep the API key out of the file in plaintext when DPAPI is available.
        if self.protect_api_key and self.api_key:
            from .secrets import protect_secret
            token = protect_secret(self.api_key)
            if token:
                data["api_key"] = ""
                data["api_key_protected"] = token

        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

        # The file holds a credential: owner-only on POSIX (Windows relies on
        # the per-user %APPDATA% ACL plus DPAPI).
        if sys.platform != "win32":
            try:
                os.chmod(config_path, 0o600)
            except OSError:
                pass

    def is_configured(self) -> bool:
        """Check if the agent is properly configured."""
        return bool(self.server_url and self.api_key)

    def needs_wizard(self) -> bool:
        """Check if the setup wizard should be shown."""
        return not self.is_configured() and not self._wizard_completed and not self._wizard_skipped

    def mark_wizard_complete(self) -> None:
        """Mark the setup wizard as completed."""
        self._wizard_completed = True
        self.save()

    def mark_wizard_skipped(self) -> None:
        """Mark the setup wizard as skipped."""
        self._wizard_skipped = True
        self.save()

    def reset_wizard_state(self) -> None:
        """Reset wizard state to allow re-running."""
        self._wizard_completed = False
        self._wizard_skipped = False
        self.save()

    def httpx_verify(self):
        """Value for httpx's ``verify=``: a CA bundle path, True, or False."""
        if self.ca_bundle:
            return self.ca_bundle
        return self.verify_tls


def _non_negative_int(value, default: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if n >= 0 else default
