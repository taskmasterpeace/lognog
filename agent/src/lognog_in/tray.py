"""System tray icon for LogNog In agent."""

import logging
import os
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

try:
    import pystray
    from PIL import Image
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False

from .shipper import ConnectionStatus

logger = logging.getLogger(__name__)


def get_base_path() -> Path:
    """Get the base path for assets (handles PyInstaller bundling)."""
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Running as PyInstaller bundle
        return Path(sys._MEIPASS)
    else:
        # Running as script - go up from tray.py to agent root
        return Path(__file__).parent.parent.parent


def get_icon_path(status: ConnectionStatus) -> Path:
    """Get the path to the icon for the given status."""
    base_path = get_base_path()

    # Look for icons in the assets directory
    icon_path = base_path / "assets" / "lognog.ico"

    if icon_path.exists():
        logger.debug(f"Found icon at: {icon_path}")
        return icon_path

    # Try alternate locations
    alternate_paths = [
        base_path / "lognog.ico",
        Path(__file__).parent / "assets" / "lognog.ico",
        Path(__file__).parent.parent.parent / "assets" / "lognog.ico",
    ]

    for alt_path in alternate_paths:
        if alt_path.exists():
            logger.debug(f"Found icon at alternate path: {alt_path}")
            return alt_path

    logger.warning(f"Icon not found, checked: {icon_path}")
    return icon_path  # Return expected path even if not found


def create_icon_image(status: ConnectionStatus) -> Optional["Image.Image"]:
    """Create an icon image for the given status."""
    if not TRAY_AVAILABLE:
        return None

    icon_path = get_icon_path(status)

    if icon_path.exists():
        try:
            return Image.open(str(icon_path))
        except Exception as e:
            logger.error(f"Failed to load icon: {e}")

    # Create a simple colored icon as fallback
    size = 64
    color = {
        ConnectionStatus.CONNECTED: (0, 200, 0),      # Green
        ConnectionStatus.DISCONNECTED: (200, 200, 0), # Yellow
        ConnectionStatus.CONNECTING: (0, 100, 200),   # Blue
        ConnectionStatus.ERROR: (200, 0, 0),          # Red
    }.get(status, (128, 128, 128))

    image = Image.new("RGB", (size, size), color)
    return image


class SystemTray:
    """
    System tray icon for the agent.

    Provides:
    - Status indicator (green/yellow/red)
    - Right-click menu with options
    - Double-click opens configuration
    - Notifications (future)
    """

    def __init__(
        self,
        on_configure: Optional[Callable[[], None]] = None,
        on_pause: Optional[Callable[[], None]] = None,
        on_resume: Optional[Callable[[], None]] = None,
        on_quit: Optional[Callable[[], None]] = None,
        on_view_logs: Optional[Callable[[], None]] = None,
        on_view_alerts: Optional[Callable[[], None]] = None,
        on_double_click: Optional[Callable[[], None]] = None,
        on_run_wizard: Optional[Callable[[], None]] = None,
    ):
        self.on_configure = on_configure
        self.on_pause = on_pause
        self.on_resume = on_resume
        self.on_quit = on_quit
        self.on_view_logs = on_view_logs
        self.on_view_alerts = on_view_alerts
        self.on_run_wizard = on_run_wizard
        # Double-click defaults to configure if not specified
        self.on_double_click = on_double_click or on_configure

        self._icon: Optional["pystray.Icon"] = None
        self._status = ConnectionStatus.DISCONNECTED
        self._paused = False
        self._thread: Optional[threading.Thread] = None
        self._stats: dict = {}

    @property
    def is_available(self) -> bool:
        """Check if system tray is available."""
        return TRAY_AVAILABLE

    def update_status(self, status: ConnectionStatus) -> None:
        """Update the tray icon status."""
        self._status = status
        if self._icon:
            self._icon.icon = create_icon_image(status)
            self._icon.title = self._get_tooltip()

    def update_stats(self, stats: dict) -> None:
        """Update the stats for tooltip."""
        self._stats = stats

    def _get_tooltip(self) -> str:
        """Get the tooltip text."""
        status_text = {
            ConnectionStatus.CONNECTED: "Connected",
            ConnectionStatus.DISCONNECTED: "Disconnected",
            ConnectionStatus.CONNECTING: "Connecting...",
            ConnectionStatus.ERROR: "Error",
        }.get(self._status, "Unknown")

        tooltip = f"LogNog In - {status_text}"

        if self._stats:
            buffered = self._stats.get("events_buffered", 0)
            if buffered > 0:
                tooltip += f"\n{buffered} events buffered"

        return tooltip

    def _create_menu(self) -> "pystray.Menu":
        """Create the right-click menu."""
        if not TRAY_AVAILABLE:
            return None

        items = [
            pystray.MenuItem(
                lambda text: f"Status: {self._status.value.title()}",
                None,
                enabled=False,
            ),
            pystray.Menu.SEPARATOR,
        ]

        if self.on_configure:
            # Configure is the default action (double-click)
            items.append(pystray.MenuItem(
                "Configure...",
                lambda: self.on_configure(),
                default=True,  # This makes it trigger on double-click
            ))

        if self.on_view_logs:
            items.append(pystray.MenuItem("View Logs", lambda: self.on_view_logs()))

        if self.on_view_alerts:
            items.append(pystray.MenuItem("View Alerts", lambda: self.on_view_alerts()))

        items.append(pystray.Menu.SEPARATOR)

        if self.on_run_wizard:
            items.append(pystray.MenuItem("Run Setup Wizard...", lambda: self.on_run_wizard()))

        items.append(pystray.Menu.SEPARATOR)

        if self.on_pause and self.on_resume:
            if self._paused:
                items.append(pystray.MenuItem("Resume", lambda: self._do_resume()))
            else:
                items.append(pystray.MenuItem("Pause", lambda: self._do_pause()))

        items.append(pystray.Menu.SEPARATOR)

        if self.on_quit:
            items.append(pystray.MenuItem("Quit", lambda: self._do_quit()))

        return pystray.Menu(*items)

    def _do_pause(self) -> None:
        """Handle pause action."""
        self._paused = True
        if self.on_pause:
            self.on_pause()
        # Refresh menu
        if self._icon:
            self._icon.menu = self._create_menu()

    def _do_resume(self) -> None:
        """Handle resume action."""
        self._paused = False
        if self.on_resume:
            self.on_resume()
        # Refresh menu
        if self._icon:
            self._icon.menu = self._create_menu()

    def _do_quit(self) -> None:
        """Handle quit action."""
        if self.on_quit:
            self.on_quit()
        self.stop()

    def start(self) -> None:
        """Start the system tray icon."""
        if not TRAY_AVAILABLE:
            logger.warning("System tray not available (pystray/pillow not installed)")
            return

        self._icon = pystray.Icon(
            name="LogNog In",
            icon=create_icon_image(self._status),
            title=self._get_tooltip(),
            menu=self._create_menu(),
        )

        # Run in background thread
        self._thread = threading.Thread(target=self._icon.run, daemon=True)
        self._thread.start()
        logger.info("System tray started")

    def stop(self) -> None:
        """Stop the system tray icon."""
        if self._icon:
            self._icon.stop()
            self._icon = None
        logger.info("System tray stopped")

    def is_running(self) -> bool:
        """Check if the tray is running."""
        return self._icon is not None

    def show_notification(self, title: str, message: str) -> None:
        """Show a system notification."""
        if not TRAY_AVAILABLE or not self._icon:
            logger.warning(f"Cannot show notification (tray not available): {title}")
            return

        try:
            self._icon.notify(title=title, message=message)
            logger.debug(f"Notification shown: {title}")
        except Exception as e:
            logger.error(f"Failed to show notification: {e}")
