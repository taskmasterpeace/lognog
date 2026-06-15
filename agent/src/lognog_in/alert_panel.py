"""Persistent desktop alert panel for LogNog In agent."""

import json
import logging
import threading
import tkinter as tk
from tkinter import ttk
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Callable, Dict, List, Optional
import webbrowser

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    """Alert severity levels with display properties."""
    CRITICAL = ("critical", "#dc2626", "#fef2f2", "CRITICAL")  # Red
    HIGH = ("high", "#ea580c", "#fff7ed", "HIGH")              # Orange
    MEDIUM = ("medium", "#ca8a04", "#fefce8", "MEDIUM")        # Yellow
    LOW = ("low", "#2563eb", "#eff6ff", "LOW")                 # Blue (info)
    INFO = ("info", "#2563eb", "#eff6ff", "INFO")              # Blue

    @property
    def color(self) -> str:
        return self.value[1]

    @property
    def bg_color(self) -> str:
        return self.value[2]

    @property
    def label(self) -> str:
        return self.value[3]

    @classmethod
    def from_string(cls, severity: str) -> "AlertSeverity":
        """Convert string severity to enum."""
        severity_lower = severity.lower() if severity else "info"
        mapping = {
            "critical": cls.CRITICAL,
            "high": cls.HIGH,
            "medium": cls.MEDIUM,
            "low": cls.LOW,
            "info": cls.INFO,
            "warning": cls.MEDIUM,
            "error": cls.HIGH,
        }
        return mapping.get(severity_lower, cls.INFO)


class Alert:
    """Represents a single alert notification."""

    def __init__(
        self,
        id: str,
        title: str,
        message: str,
        severity: str = "info",
        timestamp: Optional[str] = None,
        alert_id: Optional[str] = None,
        snoozed_until: Optional[str] = None,
        playbook: Optional[str] = None,
        search_query: Optional[str] = None,
    ):
        self.id = id
        self.title = title
        self.message = message
        self.severity = AlertSeverity.from_string(severity)
        self.timestamp = timestamp or datetime.now().isoformat()
        self.alert_id = alert_id  # LogNog alert ID for linking
        self.snoozed_until = snoozed_until
        self.playbook = playbook  # Response instructions
        self.search_query = search_query  # Original query for linking
        self.dismissed = False

    @property
    def is_snoozed(self) -> bool:
        """Check if alert is currently snoozed."""
        if not self.snoozed_until:
            return False
        try:
            snooze_time = datetime.fromisoformat(self.snoozed_until)
            return datetime.now() < snooze_time
        except (ValueError, TypeError):
            return False

    @property
    def time_ago(self) -> str:
        """Get human-readable time since alert."""
        try:
            alert_time = datetime.fromisoformat(self.timestamp)
            delta = datetime.now() - alert_time

            if delta.total_seconds() < 60:
                return "just now"
            elif delta.total_seconds() < 3600:
                mins = int(delta.total_seconds() / 60)
                return f"{mins} min ago"
            elif delta.total_seconds() < 86400:
                hours = int(delta.total_seconds() / 3600)
                return f"{hours} hr ago"
            else:
                days = int(delta.total_seconds() / 86400)
                return f"{days} day ago"
        except (ValueError, TypeError):
            return ""

    def snooze(self, minutes: int) -> None:
        """Snooze the alert for specified minutes."""
        self.snoozed_until = (datetime.now() + timedelta(minutes=minutes)).isoformat()

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "severity": self.severity.value[0],
            "timestamp": self.timestamp,
            "alert_id": self.alert_id,
            "snoozed_until": self.snoozed_until,
            "playbook": self.playbook,
            "search_query": self.search_query,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Alert":
        """Create from dictionary."""
        return cls(
            id=data.get("id", ""),
            title=data.get("title", ""),
            message=data.get("message", ""),
            severity=data.get("severity", "info"),
            timestamp=data.get("timestamp"),
            alert_id=data.get("alert_id"),
            snoozed_until=data.get("snoozed_until"),
            playbook=data.get("playbook"),
            search_query=data.get("search_query"),
        )


class AlertPanel:
    """
    Persistent desktop alert notification panel.

    Shows alerts in a sticky window that stays visible until dismissed.
    Supports severity tiers, snooze functionality, and persistence.
    """

    PANEL_WIDTH = 420
    PANEL_MIN_HEIGHT = 100
    PANEL_MAX_HEIGHT = 500
    ALERT_CARD_HEIGHT = 90

    def __init__(
        self,
        data_dir: Optional[Path] = None,
        server_url: Optional[str] = None,
        on_alert_count_change: Optional[Callable[[int], None]] = None,
        on_play_sound: Optional[Callable[[str], None]] = None,
    ):
        """
        Initialize the alert panel.

        Args:
            data_dir: Directory for persistence files
            server_url: LogNog server URL for opening dashboard
            on_alert_count_change: Callback when alert count changes (for tray badge)
            on_play_sound: Callback to play sound for severity
        """
        self.data_dir = data_dir or Path.home() / ".lognog"
        self.server_url = server_url
        self.on_alert_count_change = on_alert_count_change
        self.on_play_sound = on_play_sound

        self.alerts: List[Alert] = []
        self.window: Optional[tk.Toplevel] = None
        self._root: Optional[tk.Tk] = None
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._running = False
        self._widgets: Dict[str, tk.Frame] = {}

        # Ensure data directory exists
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._alerts_file = self.data_dir / "pending_alerts.json"

        # Load persisted alerts
        self._load_alerts()

    def _load_alerts(self) -> None:
        """Load alerts from persistence file."""
        if not self._alerts_file.exists():
            return

        try:
            with open(self._alerts_file, "r") as f:
                data = json.load(f)

            self.alerts = [Alert.from_dict(a) for a in data.get("alerts", [])]
            # Filter out snoozed alerts that have expired
            self.alerts = [a for a in self.alerts if not a.dismissed]
            logger.info(f"Loaded {len(self.alerts)} pending alerts")
        except Exception as e:
            logger.error(f"Failed to load alerts: {e}")

    def _save_alerts(self) -> None:
        """Save alerts to persistence file."""
        try:
            data = {
                "alerts": [a.to_dict() for a in self.alerts if not a.dismissed],
                "saved_at": datetime.now().isoformat(),
            }
            with open(self._alerts_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save alerts: {e}")

    @property
    def pending_count(self) -> int:
        """Get count of non-snoozed alerts."""
        return len([a for a in self.alerts if not a.is_snoozed and not a.dismissed])

    def add_alert(self, alert: Alert) -> None:
        """Add a new alert to the panel."""
        with self._lock:
            # Check for duplicate by ID
            if any(a.id == alert.id for a in self.alerts):
                logger.debug(f"Duplicate alert ignored: {alert.id}")
                return

            self.alerts.insert(0, alert)  # Newest first
            self._save_alerts()

            # Notify count change
            if self.on_alert_count_change:
                self.on_alert_count_change(self.pending_count)

            # Play sound
            if self.on_play_sound:
                self.on_play_sound(alert.severity.value[0])

        # Show/update panel
        self._schedule_ui_update()

    def dismiss_alert(self, alert_id: str) -> None:
        """Dismiss a single alert."""
        with self._lock:
            for alert in self.alerts:
                if alert.id == alert_id:
                    alert.dismissed = True
                    break

            self.alerts = [a for a in self.alerts if not a.dismissed]
            self._save_alerts()

            if self.on_alert_count_change:
                self.on_alert_count_change(self.pending_count)

        self._schedule_ui_update()

    def dismiss_all(self) -> None:
        """Dismiss all alerts."""
        with self._lock:
            self.alerts = []
            self._save_alerts()

            if self.on_alert_count_change:
                self.on_alert_count_change(0)

        self._schedule_ui_update()

    def snooze_alert(self, alert_id: str, minutes: int) -> None:
        """Snooze an alert for specified minutes."""
        with self._lock:
            for alert in self.alerts:
                if alert.id == alert_id:
                    alert.snooze(minutes)
                    break

            self._save_alerts()

            if self.on_alert_count_change:
                self.on_alert_count_change(self.pending_count)

        self._schedule_ui_update()

    def _schedule_ui_update(self) -> None:
        """Schedule a UI update on the main thread."""
        if self._root and self._running:
            try:
                self._root.after(0, self._update_panel)
            except tk.TclError:
                pass

    def _get_screen_position(self) -> tuple:
        """Get position for bottom-right corner placement."""
        if not self._root:
            return (100, 100)

        screen_width = self._root.winfo_screenwidth()
        screen_height = self._root.winfo_screenheight()

        # Account for taskbar (roughly 40px)
        taskbar_height = 50
        padding = 10

        x = screen_width - self.PANEL_WIDTH - padding
        y = screen_height - taskbar_height - self._calculate_panel_height() - padding

        return (max(0, x), max(0, y))

    def _calculate_panel_height(self) -> int:
        """Calculate panel height based on alert count."""
        visible_alerts = [a for a in self.alerts if not a.is_snoozed]
        alert_count = len(visible_alerts)

        if alert_count == 0:
            return 0

        # Header (50) + alerts + footer (50)
        height = 50 + (alert_count * self.ALERT_CARD_HEIGHT) + 60
        return min(height, self.PANEL_MAX_HEIGHT)

    def show(self) -> None:
        """Show the alert panel."""
        if not self._running:
            self._thread = threading.Thread(target=self._run_ui, daemon=True)
            self._thread.start()
        elif self.window:
            try:
                self.window.deiconify()
                self.window.lift()
            except tk.TclError:
                pass

    def hide(self) -> None:
        """Hide the alert panel (minimize to tray)."""
        if self.window:
            try:
                self.window.withdraw()
            except tk.TclError:
                pass

    def _run_ui(self) -> None:
        """Run the UI event loop."""
        self._running = True
        self._root = tk.Tk()
        self._root.withdraw()  # Hidden root window

        self._create_panel()

        # Check for un-snoozed alerts periodically
        self._check_snooze_expiry()

        try:
            self._root.mainloop()
        finally:
            self._running = False

    def _create_panel(self) -> None:
        """Create the panel window."""
        if not self._root:
            return

        visible_alerts = [a for a in self.alerts if not a.is_snoozed]
        if not visible_alerts:
            if self.window:
                self.window.withdraw()
            return

        if self.window:
            try:
                self.window.destroy()
            except tk.TclError:
                pass

        self.window = tk.Toplevel(self._root)
        self.window.title("LogNog Alerts")
        self.window.overrideredirect(True)  # No window decorations

        # Calculate position and size
        x, y = self._get_screen_position()
        height = self._calculate_panel_height()
        self.window.geometry(f"{self.PANEL_WIDTH}x{height}+{x}+{y}")

        # Always on top for critical/high alerts
        has_critical = any(a.severity in (AlertSeverity.CRITICAL, AlertSeverity.HIGH) for a in visible_alerts)
        if has_critical:
            self.window.attributes("-topmost", True)

        # Main container with border
        main_frame = tk.Frame(
            self.window,
            bg="#1f2937",  # Dark gray
            highlightbackground="#f59e0b",  # Amber border
            highlightthickness=2,
        )
        main_frame.pack(fill="both", expand=True)

        # Header
        self._create_header(main_frame, len(visible_alerts))

        # Scrollable alert list
        self._create_alert_list(main_frame, visible_alerts)

        # Footer with buttons
        self._create_footer(main_frame)

        self.window.deiconify()

    def _create_header(self, parent: tk.Frame, count: int) -> None:
        """Create the panel header."""
        header = tk.Frame(parent, bg="#1f2937", height=50)
        header.pack(fill="x", padx=2, pady=2)
        header.pack_propagate(False)

        # Title with icon
        title_frame = tk.Frame(header, bg="#1f2937")
        title_frame.pack(side="left", padx=10, pady=10)

        tk.Label(
            title_frame,
            text="LogNog Alerts",
            font=("Segoe UI", 12, "bold"),
            fg="#f59e0b",  # Amber
            bg="#1f2937",
        ).pack(side="left")

        tk.Label(
            title_frame,
            text=f"({count})",
            font=("Segoe UI", 10),
            fg="#9ca3af",
            bg="#1f2937",
        ).pack(side="left", padx=(5, 0))

        # Control buttons
        btn_frame = tk.Frame(header, bg="#1f2937")
        btn_frame.pack(side="right", padx=5, pady=10)

        # Minimize button
        minimize_btn = tk.Label(
            btn_frame,
            text="—",
            font=("Segoe UI", 14),
            fg="#9ca3af",
            bg="#1f2937",
            cursor="hand2",
        )
        minimize_btn.pack(side="left", padx=5)
        minimize_btn.bind("<Button-1>", lambda e: self.hide())
        minimize_btn.bind("<Enter>", lambda e: minimize_btn.config(fg="#ffffff"))
        minimize_btn.bind("<Leave>", lambda e: minimize_btn.config(fg="#9ca3af"))

        # Close button (dismiss all)
        close_btn = tk.Label(
            btn_frame,
            text="X",
            font=("Segoe UI", 12, "bold"),
            fg="#9ca3af",
            bg="#1f2937",
            cursor="hand2",
        )
        close_btn.pack(side="left", padx=5)
        close_btn.bind("<Button-1>", lambda e: self.dismiss_all())
        close_btn.bind("<Enter>", lambda e: close_btn.config(fg="#ef4444"))
        close_btn.bind("<Leave>", lambda e: close_btn.config(fg="#9ca3af"))

    def _create_alert_list(self, parent: tk.Frame, alerts: List[Alert]) -> None:
        """Create the scrollable alert list."""
        # Canvas for scrolling
        canvas_frame = tk.Frame(parent, bg="#1f2937")
        canvas_frame.pack(fill="both", expand=True, padx=2)

        canvas = tk.Canvas(canvas_frame, bg="#1f2937", highlightthickness=0)
        scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas.yview)

        scrollable_frame = tk.Frame(canvas, bg="#1f2937")

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw", width=self.PANEL_WIDTH - 20)
        canvas.configure(yscrollcommand=scrollbar.set)

        # Only show scrollbar if needed
        if len(alerts) > 4:
            scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        # Enable mouse wheel scrolling
        def on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        canvas.bind_all("<MouseWheel>", on_mousewheel)

        # Create alert cards
        for alert in alerts:
            self._create_alert_card(scrollable_frame, alert)

    def _create_alert_card(self, parent: tk.Frame, alert: Alert) -> None:
        """Create a single alert card."""
        severity = alert.severity

        card = tk.Frame(
            parent,
            bg=severity.bg_color,
            highlightbackground=severity.color,
            highlightthickness=2,
        )
        card.pack(fill="x", padx=5, pady=3)

        # Severity indicator bar
        indicator = tk.Frame(card, bg=severity.color, width=4)
        indicator.pack(side="left", fill="y")

        # Content area
        content = tk.Frame(card, bg=severity.bg_color)
        content.pack(side="left", fill="both", expand=True, padx=8, pady=6)

        # Top row: severity badge + title
        top_row = tk.Frame(content, bg=severity.bg_color)
        top_row.pack(fill="x")

        # Severity badge
        badge = tk.Label(
            top_row,
            text=severity.label,
            font=("Segoe UI", 8, "bold"),
            fg="#ffffff",
            bg=severity.color,
            padx=4,
            pady=1,
        )
        badge.pack(side="left")

        # Title
        title = tk.Label(
            top_row,
            text=alert.title[:40] + ("..." if len(alert.title) > 40 else ""),
            font=("Segoe UI", 10, "bold"),
            fg="#1f2937",
            bg=severity.bg_color,
            anchor="w",
        )
        title.pack(side="left", padx=(8, 0))

        # Message
        message = tk.Label(
            content,
            text=alert.message[:80] + ("..." if len(alert.message) > 80 else ""),
            font=("Segoe UI", 9),
            fg="#4b5563",
            bg=severity.bg_color,
            anchor="w",
            wraplength=350,
            justify="left",
        )
        message.pack(fill="x", pady=(4, 0))

        # Bottom row: timestamp + buttons
        bottom_row = tk.Frame(content, bg=severity.bg_color)
        bottom_row.pack(fill="x", pady=(6, 0))

        # Timestamp
        time_label = tk.Label(
            bottom_row,
            text=alert.time_ago,
            font=("Segoe UI", 8),
            fg="#6b7280",
            bg=severity.bg_color,
        )
        time_label.pack(side="left")

        # Buttons
        btn_frame = tk.Frame(bottom_row, bg=severity.bg_color)
        btn_frame.pack(side="right")

        # Snooze button with dropdown
        snooze_btn = tk.Menubutton(
            btn_frame,
            text="Snooze",
            font=("Segoe UI", 8),
            fg="#6b7280",
            bg="#e5e7eb",
            activebackground="#d1d5db",
            relief="flat",
            cursor="hand2",
            padx=8,
            pady=2,
        )
        snooze_menu = tk.Menu(snooze_btn, tearoff=0)
        snooze_menu.add_command(
            label="15 minutes",
            command=lambda: self.snooze_alert(alert.id, 15)
        )
        snooze_menu.add_command(
            label="1 hour",
            command=lambda: self.snooze_alert(alert.id, 60)
        )
        snooze_menu.add_command(
            label="4 hours",
            command=lambda: self.snooze_alert(alert.id, 240)
        )
        snooze_btn["menu"] = snooze_menu
        snooze_btn.pack(side="left", padx=2)

        # Dismiss button
        dismiss_btn = tk.Label(
            btn_frame,
            text="Dismiss",
            font=("Segoe UI", 8),
            fg="#ffffff",
            bg="#6b7280",
            cursor="hand2",
            padx=8,
            pady=2,
        )
        dismiss_btn.pack(side="left", padx=2)
        dismiss_btn.bind("<Button-1>", lambda e: self.dismiss_alert(alert.id))
        dismiss_btn.bind("<Enter>", lambda e: dismiss_btn.config(bg="#4b5563"))
        dismiss_btn.bind("<Leave>", lambda e: dismiss_btn.config(bg="#6b7280"))

        # Make card clickable to open LogNog
        def on_card_click(event):
            if self.server_url and alert.alert_id:
                webbrowser.open(f"{self.server_url}/alerts/{alert.alert_id}")

        for widget in [card, content, top_row, title, message]:
            widget.bind("<Button-1>", on_card_click)
            widget.config(cursor="hand2")

    def _create_footer(self, parent: tk.Frame) -> None:
        """Create the panel footer with action buttons."""
        footer = tk.Frame(parent, bg="#1f2937", height=50)
        footer.pack(fill="x", padx=2, pady=2)
        footer.pack_propagate(False)

        btn_frame = tk.Frame(footer, bg="#1f2937")
        btn_frame.pack(expand=True)

        # Dismiss All button
        dismiss_all_btn = tk.Label(
            btn_frame,
            text="Dismiss All",
            font=("Segoe UI", 9),
            fg="#ffffff",
            bg="#4b5563",
            cursor="hand2",
            padx=12,
            pady=4,
        )
        dismiss_all_btn.pack(side="left", padx=5, pady=10)
        dismiss_all_btn.bind("<Button-1>", lambda e: self.dismiss_all())
        dismiss_all_btn.bind("<Enter>", lambda e: dismiss_all_btn.config(bg="#374151"))
        dismiss_all_btn.bind("<Leave>", lambda e: dismiss_all_btn.config(bg="#4b5563"))

        # Open Dashboard button
        if self.server_url:
            dashboard_btn = tk.Label(
                btn_frame,
                text="Open LogNog",
                font=("Segoe UI", 9),
                fg="#1f2937",
                bg="#f59e0b",
                cursor="hand2",
                padx=12,
                pady=4,
            )
            dashboard_btn.pack(side="left", padx=5, pady=10)
            dashboard_btn.bind("<Button-1>", lambda e: webbrowser.open(self.server_url))
            dashboard_btn.bind("<Enter>", lambda e: dashboard_btn.config(bg="#d97706"))
            dashboard_btn.bind("<Leave>", lambda e: dashboard_btn.config(bg="#f59e0b"))

    def _update_panel(self) -> None:
        """Update the panel with current alerts."""
        visible_alerts = [a for a in self.alerts if not a.is_snoozed]

        if not visible_alerts:
            if self.window:
                self.window.withdraw()
            return

        # Recreate panel with updated alerts
        self._create_panel()

    def _check_snooze_expiry(self) -> None:
        """Check for expired snooze timers and show alerts."""
        if not self._running or not self._root:
            return

        # Check if any snoozed alerts have expired
        now = datetime.now()
        alerts_unsnoozing = False

        for alert in self.alerts:
            if alert.snoozed_until:
                try:
                    snooze_time = datetime.fromisoformat(alert.snoozed_until)
                    if now >= snooze_time:
                        alert.snoozed_until = None
                        alerts_unsnoozing = True
                except (ValueError, TypeError):
                    pass

        if alerts_unsnoozing:
            self._save_alerts()
            if self.on_alert_count_change:
                self.on_alert_count_change(self.pending_count)
            self._update_panel()

        # Schedule next check in 30 seconds
        try:
            self._root.after(30000, self._check_snooze_expiry)
        except tk.TclError:
            pass

    def stop(self) -> None:
        """Stop the alert panel."""
        self._running = False
        if self._root:
            try:
                self._root.quit()
                self._root.destroy()
            except tk.TclError:
                pass
        self._root = None
        self.window = None
