"""Main agent module that orchestrates all components."""

import logging
import os
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Optional

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl

from .config import Config
from .buffer import EventBuffer, LogEvent, FIMEvent
from .watcher import FileWatcher
from .fim import FileIntegrityMonitor
from .shipper import HTTPShipper, ConnectionStatus
from .tray import SystemTray
from .gui import ConfigWindow, AlertHistoryWindow

logger = logging.getLogger(__name__)


class SingleInstanceLock:
    """Ensures only one instance of the agent runs at a time."""

    def __init__(self, name: str = "lognog-in"):
        self.name = name
        self.lock_file = Config.get_data_dir() / f"{name}.lock"
        self._file_handle = None

    def acquire(self) -> bool:
        """Try to acquire the lock. Returns True if successful."""
        try:
            self.lock_file.parent.mkdir(parents=True, exist_ok=True)
            self._file_handle = open(self.lock_file, "w")

            if sys.platform == "win32":
                # Windows: use msvcrt.locking
                msvcrt.locking(self._file_handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                # Unix: use fcntl.flock
                fcntl.flock(self._file_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

            # Write PID to lock file
            self._file_handle.write(str(os.getpid()))
            self._file_handle.flush()
            return True

        except (IOError, OSError):
            if self._file_handle:
                self._file_handle.close()
                self._file_handle = None
            return False

    def release(self) -> None:
        """Release the lock."""
        if self._file_handle:
            try:
                if sys.platform == "win32":
                    msvcrt.locking(self._file_handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(self._file_handle.fileno(), fcntl.LOCK_UN)
            except (IOError, OSError):
                pass
            finally:
                self._file_handle.close()
                self._file_handle = None

    def __enter__(self):
        if not self.acquire():
            raise RuntimeError("Another instance is already running")
        return self

    def __exit__(self, *args):
        self.release()


class Agent:
    """
    LogNog In Agent - orchestrates file watching, FIM, and log shipping.

    Usage:
        agent = Agent()
        agent.start()  # Starts all components
        agent.wait()   # Block until stopped
    """

    def __init__(self, config: Optional[Config] = None, headless: bool = False):
        """
        Initialize the agent.

        Args:
            config: Agent configuration. If None, loads from default location.
            headless: If True, run without system tray.
        """
        self.config = config or Config.load()
        self.headless = headless

        # Single instance lock
        self._instance_lock = SingleInstanceLock()

        # Components
        self.buffer = EventBuffer()
        self.shipper = HTTPShipper(
            config=self.config,
            buffer=self.buffer,
            on_status_change=self._on_status_change,
            on_notification=self._on_notification,
        )
        self.watcher = FileWatcher(
            config=self.config,
            on_event=self._on_log_event,
        )
        self.fim = FileIntegrityMonitor(
            config=self.config,
            on_event=self._on_fim_event,
        )
        self.tray: Optional[SystemTray] = None
        self.config_window: Optional[ConfigWindow] = None

        # State
        self._running = False
        self._paused = False
        self._stop_event = threading.Event()

        # Alert notification history (in-memory, last 100)
        self._alert_history: list[dict] = []
        self._max_alert_history = 100

        # Setup logging
        self._setup_logging()

    def _setup_logging(self) -> None:
        """Setup logging configuration."""
        log_level = logging.DEBUG if self.config.debug_logging else logging.INFO

        # Create log directory
        log_dir = Config.get_log_dir()
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "agent.log"

        # Configure logging
        logging.basicConfig(
            level=log_level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[
                logging.FileHandler(str(log_file)),
                logging.StreamHandler(sys.stdout),
            ],
        )

    def _on_status_change(self, status: ConnectionStatus) -> None:
        """Handle connection status changes."""
        logger.info(f"Connection status: {status.value}")
        if self.tray:
            self.tray.update_status(status)
            self.tray.update_stats(self.shipper.get_stats())

    def _on_notification(self, title: str, message: str, severity: str) -> None:
        """Handle alert notifications from server."""
        logger.info(f"Alert notification: [{severity}] {title}")

        # Store in history
        from datetime import datetime
        self._alert_history.insert(0, {
            "title": title,
            "message": message,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
        })
        # Trim to max size
        if len(self._alert_history) > self._max_alert_history:
            self._alert_history = self._alert_history[:self._max_alert_history]

        if self.tray:
            self.tray.show_notification(title, message)

    def get_alert_history(self) -> list[dict]:
        """Get the alert notification history."""
        return self._alert_history.copy()

    def _on_log_event(self, event: LogEvent) -> None:
        """Handle log events from the file watcher."""
        if self._paused:
            return
        self.shipper.queue_log_event(event)

    def _on_fim_event(self, event: FIMEvent) -> None:
        """Handle FIM events."""
        if self._paused:
            return
        self.shipper.queue_fim_event(event)

    def _on_configure(self) -> None:
        """Handle configure menu action - opens GUI config window."""
        logger.info("Opening configuration window")

        # Create and show config window
        self.config_window = ConfigWindow(
            config=self.config,
            on_save=self._on_config_saved,
        )
        self.config_window.show()

    def _on_config_saved(self, new_config: Config) -> None:
        """Handle config saved from GUI."""
        logger.info("Configuration saved")
        self.config = new_config
        # Note: Full reload requires restart for now

    def _on_pause(self) -> None:
        """Handle pause action."""
        self._paused = True
        logger.info("Agent paused")

    def _on_resume(self) -> None:
        """Handle resume action."""
        self._paused = False
        logger.info("Agent resumed")

    def _on_quit(self) -> None:
        """Handle quit action."""
        logger.info("Quit requested")
        self.stop()

    def _on_view_alerts(self) -> None:
        """Handle view alerts action - opens alert history window."""
        logger.info("Opening alert history window")
        self.alert_history_window = AlertHistoryWindow(alerts=self._alert_history)
        self.alert_history_window.show()

    def _on_view_logs(self) -> None:
        """Handle view logs action - opens log file."""
        log_file = Config.get_log_dir() / "agent.log"
        logger.info(f"Opening logs: {log_file}")

        # Ensure log file exists
        if not log_file.exists():
            log_file.parent.mkdir(parents=True, exist_ok=True)
            log_file.touch()

        self._open_file(log_file)

    def _open_file(self, path: Path) -> None:
        """Open a file with the system default application."""
        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                subprocess.run(["open", str(path)], check=True)
            else:
                subprocess.run(["xdg-open", str(path)], check=True)
        except Exception as e:
            logger.error(f"Failed to open file {path}: {e}")

    def start(self) -> None:
        """Start the agent and all components."""
        if self._running:
            logger.warning("Agent already running")
            return

        # Check for single instance
        if not self._instance_lock.acquire():
            logger.error("Another instance of LogNog In is already running")
            if sys.platform == "win32":
                import ctypes
                ctypes.windll.user32.MessageBoxW(
                    0,
                    "LogNog In is already running.\n\nCheck the system tray for the existing instance.",
                    "LogNog In",
                    0x40  # MB_ICONINFORMATION
                )
            raise RuntimeError("Another instance is already running")

        logger.info("Starting LogNog In agent...")

        # Check configuration
        if not self.config.is_configured():
            logger.warning("Agent not fully configured (missing server URL or API key)")

        # Start system tray (unless headless)
        if not self.headless:
            self.tray = SystemTray(
                on_configure=self._on_configure,
                on_pause=self._on_pause,
                on_resume=self._on_resume,
                on_quit=self._on_quit,
                on_view_logs=self._on_view_logs,
                on_view_alerts=self._on_view_alerts,
            )
            self.tray.start()

        # Start shipper
        self.shipper.start()

        # Start file watcher
        if self.config.watch_paths:
            self.watcher.start()

        # Start FIM
        if self.config.fim_enabled and self.config.fim_paths:
            self.fim.start()

        self._running = True
        self._stop_event.clear()

        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        logger.info("LogNog In agent started")
        logger.info(f"  Server: {self.config.server_url}")
        logger.info(f"  Hostname: {self.config.hostname}")
        logger.info(f"  Watch paths: {len(self.config.watch_paths)}")
        logger.info(f"  FIM enabled: {self.config.fim_enabled}")

    def stop(self) -> None:
        """Stop the agent and all components."""
        if not self._running:
            return

        logger.info("Stopping LogNog In agent...")

        # Stop components in reverse order
        self.fim.stop()
        self.watcher.stop()
        self.shipper.stop()

        if self.tray:
            self.tray.stop()
            self.tray = None

        self._running = False
        self._stop_event.set()

        # Release single instance lock
        self._instance_lock.release()

        logger.info("LogNog In agent stopped")

    def wait(self) -> None:
        """Wait until the agent is stopped."""
        self._stop_event.wait()

    def is_running(self) -> bool:
        """Check if the agent is running."""
        return self._running

    def _signal_handler(self, signum: int, frame) -> None:
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}")
        self.stop()

    def get_status(self) -> dict:
        """Get the current agent status."""
        return {
            "running": self._running,
            "paused": self._paused,
            "configured": self.config.is_configured(),
            "shipper": self.shipper.get_stats(),
            "watcher": {
                "running": self.watcher.is_running(),
                "paths": self.watcher.get_watched_paths(),
            },
            "fim": {
                "running": self.fim.is_running(),
                "enabled": self.config.fim_enabled,
            },
        }
