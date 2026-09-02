"""Main agent module that orchestrates all components."""

import logging
import os
import signal
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl

from . import __version__
from .config import Config
from .buffer import EventBuffer, LogEvent, FIMEvent
from .watcher import FileWatcher
from .fim import FileIntegrityMonitor
from .shipper import HTTPShipper, ConnectionStatus
from .tray import SystemTray
from .gui import ConfigWindow, AlertHistoryWindow
from .wizard import SetupWizard
from .sound_alerts import SoundAlertManager

# Import Windows Event collector only on Windows
if sys.platform == "win32":
    try:
        from .collectors.windows_events import WindowsEventCollector
        HAS_WINDOWS_EVENTS = True
    except ImportError:
        HAS_WINDOWS_EVENTS = False
        logger = logging.getLogger(__name__)
        logger.warning("pywin32 not available - Windows Event collection disabled")
else:
    HAS_WINDOWS_EVENTS = False

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
        self.buffer = EventBuffer(
            max_rows=self.config.buffer_max_rows,
            max_bytes=self.config.buffer_max_bytes,
        )
        self.shipper = HTTPShipper(
            config=self.config,
            buffer=self.buffer,
            on_status_change=self._on_status_change,
            on_notification=self._on_notification,
            stats_provider=self._collector_stats,
        )
        self.watcher = FileWatcher(
            config=self.config,
            on_event=self._on_log_event,
            on_batch=self._on_log_events,
        )
        self.fim = FileIntegrityMonitor(
            config=self.config,
            on_event=self._on_fim_event,
        )

        # Windows Event collector (only on Windows with pywin32)
        self.windows_events: Optional['WindowsEventCollector'] = None
        if HAS_WINDOWS_EVENTS and self.config.windows_events.enabled:
            from .collectors.windows_events import WindowsEventCollector
            we = self.config.windows_events
            self.windows_events = WindowsEventCollector(
                channels=we.channels,
                hostname=self.config.hostname,
                event_ids=we.event_ids,
                exclude_event_ids=we.exclude_event_ids,
                poll_interval=we.poll_interval,
                batch_size=we.batch_size,
                api=we.api,
                index=we.index,
                on_event=self._on_log_event,
                on_batch=self._on_log_events,
            )

        self.tray: Optional[SystemTray] = None
        self.config_window: Optional[ConfigWindow] = None

        # Sound alerts
        self.sound_manager = SoundAlertManager(config=self.config)

        # State
        self._running = False
        self._paused = False
        self._stop_event = threading.Event()
        self._stats_timer: Optional[threading.Timer] = None

        # Alert notification history (in-memory, last 100)
        self._alert_history: list[dict] = []
        self._max_alert_history = 100

        # Wizard instance
        self._wizard: Optional[SetupWizard] = None
        self._wizard_shown = False

        # Setup logging
        self._setup_logging()

    def _setup_logging(self) -> None:
        """Setup logging configuration."""
        log_level = logging.DEBUG if self.config.debug_logging else logging.INFO

        # Create log directory
        log_dir = Config.get_log_dir()
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "agent.log"

        # Rotating file handler so the agent log can't grow without bound.
        # 10 MB per file, 5 backups (~50 MB max on disk).
        from logging.handlers import RotatingFileHandler

        file_handler = RotatingFileHandler(
            str(log_file),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )

        handlers: list[logging.Handler] = [file_handler]
        # A windowed EXE has no stdout; don't hand logging a closed stream.
        if sys.stdout is not None and hasattr(sys.stdout, "write"):
            handlers.append(logging.StreamHandler(sys.stdout))

        logging.basicConfig(
            level=log_level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=handlers,
            force=True,
        )

    # ------------------------------------------------------------ callbacks
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
        self._alert_history.insert(0, {
            "title": title,
            "message": message,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
        })
        # Trim to max size
        if len(self._alert_history) > self._max_alert_history:
            self._alert_history = self._alert_history[:self._max_alert_history]

        # Play sound alert
        self.sound_manager.play_alert(severity)

        if self.tray:
            self.tray.show_notification(title, message)

    def get_alert_history(self) -> list[dict]:
        """Get the alert notification history."""
        return self._alert_history.copy()

    def _on_log_event(self, event: LogEvent) -> None:
        """Handle a single log event from a collector."""
        if self._paused:
            return
        self.shipper.queue_log_event(event)

    def _on_log_events(self, events: list[LogEvent]) -> None:
        """Handle a batch of log events (one buffer transaction)."""
        if self._paused or not events:
            return
        self.shipper.queue_log_events(events)

    def _on_fim_event(self, event: FIMEvent) -> None:
        """Handle FIM events."""
        if self._paused:
            return
        self.shipper.queue_fim_event(event)

    def _collector_stats(self) -> dict:
        """Counters folded into every heartbeat event."""
        stats: dict = {
            "watch_paths": len([wp for wp in self.config.watch_paths if wp.enabled]),
            "fim_enabled": bool(self.config.fim_enabled and self.config.fim_paths),
            "paused": self._paused,
        }
        try:
            stats["file_scans"] = self.watcher.get_stats().get("scans", 0)
        except Exception:
            pass
        if self.windows_events:
            we = self.windows_events.get_stats()
            stats["winevents_collected"] = we.get("events_collected", 0)
            stats["winevents_filtered"] = we.get("events_filtered", 0)
            stats["winevents_api"] = we.get("api")
            if we.get("channel_errors"):
                stats["winevents_channel_errors"] = we["channel_errors"]
        return stats

    # -------------------------------------------------------------- tray UI
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
        # Update sound manager with new config
        self.sound_manager.update_config(new_config)
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

    def _on_open_server(self) -> None:
        """Open the LogNog web UI in the default browser."""
        url = self.config.server_url
        if url:
            logger.info(f"Opening {url}")
            try:
                webbrowser.open(url)
            except Exception as e:
                logger.error(f"Could not open browser: {e}")

    def send_test_event(self) -> None:
        """Queue a test event so the round trip is visible in LogNog."""
        message = f"LogNog In {__version__} test event from {self.config.hostname}"
        self.shipper.queue_log_event(LogEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            hostname=self.config.hostname,
            source="lognog-in",
            source_type="agent_test",
            file_path="",
            message=message,
            metadata={"severity": "info", "agent_version": __version__},
        ))
        logger.info("Test event queued")
        if self.tray:
            self.tray.show_notification("LogNog In", "Test event queued — search LogNog for source_type=agent_test")

    def flush_now(self) -> None:
        """Ship the offline buffer immediately (in the background)."""
        def _run():
            try:
                self.watcher.scan_now()
            except Exception:
                pass
            sent = 0
            try:
                sent = self.shipper.flush(timeout=30.0)
            except Exception as e:
                logger.warning(f"Manual flush failed: {e}")
            logger.info(f"Manual flush shipped {sent} event(s)")
            if self.tray:
                self.tray.update_stats(self.shipper.get_stats())
                self.tray.show_notification("LogNog In", f"Flushed {sent} event(s); {self.buffer.count()} still buffered")

        threading.Thread(target=_run, daemon=True, name="lognog-flush").start()

    def _show_setup_wizard(self) -> None:
        """Show the setup wizard for first-run configuration."""
        if self._wizard_shown:
            return
        self._wizard_shown = True
        logger.info("Showing setup wizard")
        self._wizard = SetupWizard(
            config=self.config,
            on_complete=self._on_wizard_complete,
            on_skip=self._on_wizard_skip,
        )
        self._wizard.show()

    def _on_wizard_complete(self, config: Config) -> None:
        """Handle wizard completion with new config."""
        logger.info("Setup wizard completed")
        self.config = config
        self.config.mark_wizard_complete()
        # Update components with new config
        self.shipper.config = config
        self.watcher.config = config
        self.sound_manager.update_config(config)

    def _on_wizard_skip(self) -> None:
        """Handle wizard skip."""
        logger.info("Setup wizard skipped")
        self.config.mark_wizard_skipped()

    def show_wizard(self) -> None:
        """Manually show the setup wizard (from tray menu)."""
        self._wizard_shown = False  # Allow re-showing
        self._show_setup_wizard()

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

    def _refresh_tray_stats(self) -> None:
        """Keep the tray tooltip / stats line fresh even between status changes."""
        if not self._running:
            return
        if self.tray:
            try:
                self.tray.update_stats(self.shipper.get_stats())
            except Exception:
                pass
        self._stats_timer = threading.Timer(10.0, self._refresh_tray_stats)
        self._stats_timer.daemon = True
        self._stats_timer.start()

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        """Start the agent and all components."""
        if self._running:
            logger.warning("Agent already running")
            return

        # Check for single instance
        if not self._instance_lock.acquire():
            logger.error("Another instance of LogNog In is already running")
            if sys.platform == "win32" and not self.headless:
                import ctypes
                ctypes.windll.user32.MessageBoxW(
                    0,
                    "LogNog In is already running.\n\nCheck the system tray for the existing instance.",
                    "LogNog In",
                    0x40  # MB_ICONINFORMATION
                )
            raise RuntimeError("Another instance is already running")

        logger.info(f"Starting LogNog In agent {__version__}...")

        # Check if wizard is needed (first run, unconfigured)
        if not self.headless and self.config.needs_wizard():
            logger.info("First run detected - showing setup wizard")
            self._show_setup_wizard()

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
                on_run_wizard=self.show_wizard,
                on_open_server=self._on_open_server,
                on_send_test=self.send_test_event,
                on_flush=self.flush_now,
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

        # Start Windows Event collector
        if self.windows_events:
            self.windows_events.start()

        self._running = True
        self._stop_event.clear()

        # Setup signal handlers. Only legal on the main thread — under the
        # Windows service framework SvcDoRun runs on a worker thread and
        # signal.signal raises ValueError, which used to crash service start.
        if threading.current_thread() is threading.main_thread():
            try:
                signal.signal(signal.SIGINT, self._signal_handler)
                signal.signal(signal.SIGTERM, self._signal_handler)
            except (ValueError, OSError) as e:
                logger.debug(f"Signal handlers not installed: {e}")

        if self.tray:
            self._refresh_tray_stats()

        logger.info("LogNog In agent started")
        logger.info(f"  Server: {self.config.server_url}")
        logger.info(f"  Hostname: {self.config.hostname}")
        logger.info(f"  Watch paths: {len(self.config.watch_paths)}")
        logger.info(f"  FIM enabled: {self.config.fim_enabled}")
        logger.info(f"  Windows Events enabled: {self.windows_events is not None}")
        if self.windows_events:
            logger.info(f"  Windows Event channels: {', '.join(self.config.windows_events.channels)}")
        if self.config.tags:
            logger.info(f"  Tags: {self.config.tags}")

    def stop(self) -> None:
        """Stop the agent and all components."""
        if not self._running:
            return

        logger.info("Stopping LogNog In agent...")
        self._running = False
        if self._stats_timer:
            self._stats_timer.cancel()
            self._stats_timer = None

        # Stop components in reverse order
        if self.windows_events:
            self.windows_events.stop()
        self.fim.stop()
        self.watcher.stop()
        self.shipper.stop()

        if self.tray:
            self.tray.stop()
            self.tray = None

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
        status = {
            "version": __version__,
            "running": self._running,
            "paused": self._paused,
            "configured": self.config.is_configured(),
            "shipper": self.shipper.get_stats(),
            "watcher": self.watcher.get_stats(),
            "fim": {
                "running": self.fim.is_running(),
                "enabled": self.config.fim_enabled,
            },
        }

        # Add Windows Event collector status if available
        if self.windows_events:
            status["windows_events"] = self.windows_events.get_stats()
        else:
            status["windows_events"] = {
                "running": False,
                "enabled": self.config.windows_events.enabled,
                "available": HAS_WINDOWS_EVENTS,
            }

        return status
