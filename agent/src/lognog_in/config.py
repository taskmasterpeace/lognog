"""Configuration management for LogNog In agent."""

import os
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import appdirs


APP_NAME = "lognog-in"
APP_AUTHOR = "MachineKingLabs"


@dataclass
class WatchPath:
    """A path to watch for log files."""
    path: str
    pattern: str = "*"
    recursive: bool = True
    enabled: bool = True


@dataclass
class FIMPath:
    """A path to monitor for file integrity."""
    path: str
    pattern: str = "*"
    recursive: bool = True
    enabled: bool = True


@dataclass
class WindowsEventsConfig:
    """Configuration for Windows Event Log collection."""
    enabled: bool = False
    channels: list[str] = field(default_factory=lambda: ["Security", "System", "Application"])
    event_ids: Optional[list[int]] = None  # None = collect all events
    poll_interval: int = 10  # seconds


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

        with open(config_path, "r") as f:
            data = yaml.safe_load(f) or {}

        # Parse watch paths
        watch_paths = []
        for wp in data.get("watch_paths", []):
            if isinstance(wp, str):
                watch_paths.append(WatchPath(path=wp))
            elif isinstance(wp, dict):
                watch_paths.append(WatchPath(**wp))

        # Parse FIM paths
        fim_paths = []
        for fp in data.get("fim_paths", []):
            if isinstance(fp, str):
                fim_paths.append(FIMPath(path=fp))
            elif isinstance(fp, dict):
                fim_paths.append(FIMPath(**fp))

        # Parse Windows Events config
        windows_events_data = data.get("windows_events", {})
        if isinstance(windows_events_data, dict):
            windows_events = WindowsEventsConfig(
                enabled=windows_events_data.get("enabled", False),
                channels=windows_events_data.get("channels", ["Security", "System", "Application"]),
                event_ids=windows_events_data.get("event_ids"),
                poll_interval=windows_events_data.get("poll_interval", 10),
            )
        else:
            windows_events = WindowsEventsConfig()

        config = cls(
            server_url=data.get("server_url", "http://localhost:4000"),
            api_key=data.get("api_key", ""),
            watch_paths=watch_paths,
            fim_paths=fim_paths,
            fim_enabled=data.get("fim_enabled", False),
            windows_events=windows_events,
            hostname=data.get("hostname", cls().hostname),
            batch_size=data.get("batch_size", 100),
            batch_interval_seconds=data.get("batch_interval_seconds", 5.0),
            retry_max_attempts=data.get("retry_max_attempts", 5),
            retry_backoff_seconds=data.get("retry_backoff_seconds", 2.0),
            start_on_boot=data.get("start_on_boot", False),
            send_hostname=data.get("send_hostname", True),
            debug_logging=data.get("debug_logging", False),
            sound_alerts_enabled=data.get("sound_alerts_enabled", False),
            sound_critical=data.get("sound_critical", "default"),
            sound_error=data.get("sound_error", "default"),
            sound_warning=data.get("sound_warning", "default"),
            sound_info=data.get("sound_info", "default"),
            sound_volume=data.get("sound_volume", 100),
            _config_path=config_path,
        )
        return config

    def save(self, path: Optional[Path] = None) -> None:
        """Save configuration to file."""
        config_path = path or self.get_config_path()
        config_path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "server_url": self.server_url,
            "api_key": self.api_key,
            "watch_paths": [
                {
                    "path": wp.path,
                    "pattern": wp.pattern,
                    "recursive": wp.recursive,
                    "enabled": wp.enabled,
                }
                for wp in self.watch_paths
            ],
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
            "windows_events": {
                "enabled": self.windows_events.enabled,
                "channels": self.windows_events.channels,
                "event_ids": self.windows_events.event_ids,
                "poll_interval": self.windows_events.poll_interval,
            },
            "hostname": self.hostname,
            "batch_size": self.batch_size,
            "batch_interval_seconds": self.batch_interval_seconds,
            "retry_max_attempts": self.retry_max_attempts,
            "retry_backoff_seconds": self.retry_backoff_seconds,
            "start_on_boot": self.start_on_boot,
            "send_hostname": self.send_hostname,
            "debug_logging": self.debug_logging,
            "sound_alerts_enabled": self.sound_alerts_enabled,
            "sound_critical": self.sound_critical,
            "sound_error": self.sound_error,
            "sound_warning": self.sound_warning,
            "sound_info": self.sound_info,
            "sound_volume": self.sound_volume,
        }

        with open(config_path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

    def is_configured(self) -> bool:
        """Check if the agent is properly configured."""
        return bool(self.server_url and self.api_key)
