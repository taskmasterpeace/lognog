"""System tray icon for LogNog In agent."""

import logging
import os
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

try:
    import pystray
    from PIL import Image, ImageDraw
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False

from .shipper import ConnectionStatus

logger = logging.getLogger(__name__)

# Status dot colours composited onto the brand icon (bottom-right corner).
STATUS_COLORS = {
    ConnectionStatus.CONNECTED: (46, 160, 67),      # green
    ConnectionStatus.DISCONNECTED: (200, 134, 43),  # honey/amber: buffering
    ConnectionStatus.CONNECTING: (200, 134, 43),
    ConnectionStatus.ERROR: (208, 52, 44),          # red
}
BRAND_BROWN = (90, 63, 36)
BRAND_CREAM = (250, 248, 245)


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


def _with_status_dot(image: "Image.Image", status: ConnectionStatus, paused: bool = False) -> "Image.Image":
    """Composite a coloured status dot onto the bottom-right of the icon.

    The brand icon alone gave no hint whether the agent was connected,
    buffering or broken; the dot is what makes the tray glanceable.
    """
    img = image.convert("RGBA")
    w, h = img.size
    d = max(6, int(min(w, h) * 0.42))
    x1, y1 = w - d, h - d
    draw = ImageDraw.Draw(img)
    colour = (128, 128, 128) if paused else STATUS_COLORS.get(status, (128, 128, 128))
    # White ring for contrast against any wallpaper/taskbar.
    draw.ellipse([x1 - 1, y1 - 1, w, h], fill=(255, 255, 255, 255))
    draw.ellipse([x1 + 1, y1 + 1, w - 2, h - 2], fill=colour + (255,))
    if paused:
        # Two small bars = pause glyph.
        bx, by = x1 + d // 3, y1 + d // 3
        draw.rectangle([bx, by, bx + max(1, d // 8), h - d // 3 - 2], fill=(255, 255, 255, 255))
        bx2 = w - d // 3 - max(1, d // 8) - 2
        draw.rectangle([bx2, by, bx2 + max(1, d // 8), h - d // 3 - 2], fill=(255, 255, 255, 255))
    return img


def create_icon_image(status: ConnectionStatus, paused: bool = False) -> Optional["Image.Image"]:
    """Create an icon image for the given status."""
    if not TRAY_AVAILABLE:
        return None

    icon_path = get_icon_path(status)
    base: Optional["Image.Image"] = None

    if icon_path.exists():
        try:
            base = Image.open(str(icon_path))
            # .ico files carry several sizes; pick the largest for a crisp dot.
            try:
                sizes = getattr(base, "ico", None)
                if sizes is not None:
                    largest = max(sizes.sizes(), key=lambda s: s[0])
                    base = sizes.getimage(largest)
            except Exception:
                pass
            base = base.convert("RGBA")
            # A tiny frame makes the dot a 3-pixel smudge; work at 64px and
            # let the tray scale down.
            if base.size[0] < 64:
                base = base.resize((64, 64), Image.Resampling.LANCZOS)
        except Exception as e:
            logger.error(f"Failed to load icon: {e}")
            base = None

    if base is None:
        # Fallback: brand-coloured rounded square with a cream "N".
        size = 64
        base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(base)
        draw.rounded_rectangle([2, 2, size - 3, size - 3], radius=14, fill=BRAND_BROWN + (255,))
        draw.text((size // 2 - 9, size // 2 - 14), "N", fill=BRAND_CREAM + (255,))

    return _with_status_dot(base, status, paused)


class SystemTray:
    """
    System tray icon for the agent.

    Provides:
    - Status indicator (green/amber/red dot on the brand icon)
    - Right-click menu with options
    - Double-click opens configuration
    - Notifications
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
        on_open_server: Optional[Callable[[], None]] = None,
        on_send_test: Optional[Callable[[], None]] = None,
        on_flush: Optional[Callable[[], None]] = None,
    ):
        self.on_configure = on_configure
        self.on_pause = on_pause
        self.on_resume = on_resume
        self.on_quit = on_quit
        self.on_view_logs = on_view_logs
        self.on_view_alerts = on_view_alerts
        self.on_run_wizard = on_run_wizard
        self.on_open_server = on_open_server
        self.on_send_test = on_send_test
        self.on_flush = on_flush
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
        self._refresh_icon()

    def update_stats(self, stats: dict) -> None:
        """Update the stats for tooltip and the menu's stats line."""
        self._stats = stats or {}
        if self._icon:
            self._icon.title = self._get_tooltip()
            try:
                self._icon.update_menu()
            except Exception:
                pass

    def _refresh_icon(self) -> None:
        if self._icon:
            self._icon.icon = create_icon_image(self._status, self._paused)
            self._icon.title = self._get_tooltip()
            try:
                self._icon.update_menu()
            except Exception:
                pass

    def _status_text(self) -> str:
        if self._paused:
            return "Paused"
        return {
            ConnectionStatus.CONNECTED: "Connected",
            ConnectionStatus.DISCONNECTED: "Offline — buffering",
            ConnectionStatus.CONNECTING: "Connecting…",
            ConnectionStatus.ERROR: "Error",
        }.get(self._status, "Unknown")

    def _stats_text(self) -> str:
        if not self._stats:
            return "No activity yet"
        sent = self._stats.get("events_sent", 0)
        buffered = self._stats.get("events_buffered", 0)
        dropped = self._stats.get("events_dropped", 0)
        text = f"{sent:,} sent · {buffered:,} buffered"
        if dropped:
            text += f" · {dropped:,} dropped"
        return text

    def _get_tooltip(self) -> str:
        """Get the tooltip text."""
        tooltip = f"LogNog In — {self._status_text()}"
        if self._stats:
            tooltip += f"\n{self._stats_text()}"
            err = self._stats.get("last_error")
            if err and self._status in (ConnectionStatus.ERROR, ConnectionStatus.DISCONNECTED):
                tooltip += f"\n{err}"
        # Windows tooltips are capped at 127 characters.
        return tooltip[:127]

    def _create_menu(self) -> "pystray.Menu":
        """Create the right-click menu."""
        if not TRAY_AVAILABLE:
            return None

        items = [
            pystray.MenuItem(lambda text: f"Status: {self._status_text()}", None, enabled=False),
            pystray.MenuItem(lambda text: self._stats_text(), None, enabled=False),
            pystray.Menu.SEPARATOR,
        ]

        if self.on_configure:
            # Configure is the default action (double-click)
            items.append(pystray.MenuItem(
                "Configure...",
                lambda: self.on_configure(),
                default=True,  # This makes it trigger on double-click
            ))

        if self.on_open_server:
            items.append(pystray.MenuItem("Open LogNog", lambda: self.on_open_server()))

        if self.on_view_logs:
            items.append(pystray.MenuItem("View Agent Log", lambda: self.on_view_logs()))

        if self.on_view_alerts:
            items.append(pystray.MenuItem("View Alerts", lambda: self.on_view_alerts()))

        items.append(pystray.Menu.SEPARATOR)

        if self.on_send_test:
            items.append(pystray.MenuItem("Send Test Event", lambda: self.on_send_test()))

        if self.on_flush:
            items.append(pystray.MenuItem("Flush Buffer Now", lambda: self.on_flush()))

        if self.on_run_wizard:
            items.append(pystray.MenuItem("Run Setup Wizard...", lambda: self.on_run_wizard()))

        items.append(pystray.Menu.SEPARATOR)

        if self.on_pause and self.on_resume:
            items.append(pystray.MenuItem(
                lambda text: "Resume" if self._paused else "Pause",
                lambda: self._do_resume() if self._paused else self._do_pause(),
            ))

        items.append(pystray.Menu.SEPARATOR)

        if self.on_quit:
            items.append(pystray.MenuItem("Quit", lambda: self._do_quit()))

        return pystray.Menu(*items)

    def _do_pause(self) -> None:
        """Handle pause action."""
        self._paused = True
        if self.on_pause:
            self.on_pause()
        self._refresh_icon()

    def _do_resume(self) -> None:
        """Handle resume action."""
        self._paused = False
        if self.on_resume:
            self.on_resume()
        self._refresh_icon()

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
