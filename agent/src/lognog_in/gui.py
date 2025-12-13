"""GUI configuration window for LogNog In agent."""

import logging
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from pathlib import Path
from typing import Optional, Callable

from .config import Config, WatchPath, FIMPath

logger = logging.getLogger(__name__)


def get_asset_path(filename: str) -> Optional[Path]:
    """Get path to an asset file (handles PyInstaller bundling)."""
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent.parent.parent

    asset_path = base_path / "assets" / filename
    if asset_path.exists():
        return asset_path
    return None


class ToolTip:
    """Simple tooltip implementation."""

    def __init__(self, widget, text):
        self.widget = widget
        self.text = text
        self.tooltip = None
        widget.bind("<Enter>", self.show)
        widget.bind("<Leave>", self.hide)

    def show(self, event=None):
        x, y, _, _ = self.widget.bbox("insert") if hasattr(self.widget, 'bbox') else (0, 0, 0, 0)
        x += self.widget.winfo_rootx() + 25
        y += self.widget.winfo_rooty() + 25

        self.tooltip = tk.Toplevel(self.widget)
        self.tooltip.wm_overrideredirect(True)
        self.tooltip.wm_geometry(f"+{x}+{y}")

        label = ttk.Label(
            self.tooltip,
            text=self.text,
            background="#ffffe0",
            relief="solid",
            borderwidth=1,
            padding=(5, 2),
        )
        label.pack()

    def hide(self, event=None):
        if self.tooltip:
            self.tooltip.destroy()
            self.tooltip = None


class ConfigWindow:
    """Configuration GUI window."""

    def __init__(
        self,
        config: Config,
        on_save: Optional[Callable[[Config], None]] = None,
        on_close: Optional[Callable[[], None]] = None,
    ):
        self.config = config
        self.on_save = on_save
        self.on_close = on_close
        self.window: Optional[tk.Tk] = None
        self._thread: Optional[threading.Thread] = None

    def show(self) -> None:
        """Show the configuration window."""
        if self.window is not None:
            try:
                self.window.lift()
                self.window.focus_force()
                return
            except tk.TclError:
                pass

        # Run in thread to not block
        self._thread = threading.Thread(target=self._create_window, daemon=True)
        self._thread.start()

    def _create_window(self) -> None:
        """Create and run the configuration window."""
        self.window = tk.Tk()
        self.window.title("LogNog In - Configuration")
        self.window.geometry("580x750")
        self.window.resizable(True, True)
        self.window.configure(bg="#f0f0f0")

        # Set icon if available
        icon_path = get_asset_path("lognog.ico")
        if icon_path:
            try:
                self.window.iconbitmap(str(icon_path))
            except Exception:
                pass

        # Create notebook for tabs
        notebook = ttk.Notebook(self.window)
        notebook.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)

        self.window.columnconfigure(0, weight=1)
        self.window.rowconfigure(0, weight=1)

        # Create tabs
        general_tab = ttk.Frame(notebook, padding="15")
        sound_tab = ttk.Frame(notebook, padding="15")

        notebook.add(general_tab, text="General")
        notebook.add(sound_tab, text="Sound Alerts")

        # Configure general tab
        main_frame = general_tab
        main_frame.columnconfigure(1, weight=1)

        row = 0

        # === HEADER / BRANDING ===
        header_frame = ttk.Frame(main_frame)
        header_frame.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(0, 15))

        # Try to load and display logo
        try:
            from PIL import Image, ImageTk
            logo_path = get_asset_path("lognog.ico")
            if logo_path:
                img = Image.open(str(logo_path))
                img = img.resize((48, 48), Image.Resampling.LANCZOS)
                self._logo_image = ImageTk.PhotoImage(img)
                logo_label = ttk.Label(header_frame, image=self._logo_image)
                logo_label.pack(side="left", padx=(0, 10))
        except Exception as e:
            logger.debug(f"Could not load logo: {e}")

        # Title and subtitle
        title_frame = ttk.Frame(header_frame)
        title_frame.pack(side="left", fill="x")

        title_label = ttk.Label(
            title_frame,
            text="LogNog In",
            font=("Segoe UI", 18, "bold"),
        )
        title_label.pack(anchor="w")

        subtitle_label = ttk.Label(
            title_frame,
            text="Lightweight Log Shipping Agent",
            font=("Segoe UI", 9),
            foreground="#666666",
        )
        subtitle_label.pack(anchor="w")

        # Machine King Labs
        brand_label = ttk.Label(
            header_frame,
            text="Machine King Labs",
            font=("Segoe UI", 8),
            foreground="#999999",
        )
        brand_label.pack(side="right", anchor="e")

        row += 1

        ttk.Separator(main_frame, orient="horizontal").grid(
            row=row, column=0, columnspan=2, sticky="ew", pady=(0, 15)
        )
        row += 1

        # === Server Connection ===
        ttk.Label(main_frame, text="Server Connection", font=("Segoe UI", 11, "bold")).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(0, 5)
        )
        row += 1

        # Server URL
        url_label = ttk.Label(main_frame, text="Server URL:")
        url_label.grid(row=row, column=0, sticky="w", pady=2)
        ToolTip(url_label, "The URL of your LogNog server (e.g., http://localhost:4000)")

        self.server_url = tk.StringVar(value=self.config.server_url)
        url_entry = ttk.Entry(main_frame, textvariable=self.server_url, width=50)
        url_entry.grid(row=row, column=1, sticky="ew", pady=2)
        ToolTip(url_entry, "Enter your LogNog server URL\nExample: http://192.168.1.100:4000")
        row += 1

        # API Key
        key_label = ttk.Label(main_frame, text="API Key:")
        key_label.grid(row=row, column=0, sticky="w", pady=2)
        ToolTip(key_label, "API key for authenticating with the server")

        self.api_key = tk.StringVar(value=self.config.api_key)
        api_entry = ttk.Entry(main_frame, textvariable=self.api_key, width=50, show="*")
        api_entry.grid(row=row, column=1, sticky="ew", pady=2)
        ToolTip(api_entry, "Enter your API key (starts with 'lnog_')")
        row += 1

        # API Key help text
        help_frame = ttk.Frame(main_frame)
        help_frame.grid(row=row, column=1, sticky="w", pady=(0, 5))

        self.show_key = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            help_frame,
            text="Show",
            variable=self.show_key,
            command=lambda: api_entry.configure(show="" if self.show_key.get() else "*"),
        ).pack(side="left")

        help_label = ttk.Label(
            help_frame,
            text="   Get your API key from LogNog → Settings → API Keys",
            font=("Segoe UI", 8),
            foreground="#0066cc",
            cursor="hand2",
        )
        help_label.pack(side="left", padx=(10, 0))
        ToolTip(help_label, "In your LogNog web interface:\n1. Go to Settings\n2. Click 'API Keys'\n3. Create a new key with 'write' permission\n4. Copy and paste it here")
        row += 1

        # Test connection button
        ttk.Button(main_frame, text="Test Connection", command=self._test_connection).grid(
            row=row, column=1, sticky="w", pady=5
        )
        row += 1

        ttk.Separator(main_frame, orient="horizontal").grid(
            row=row, column=0, columnspan=2, sticky="ew", pady=10
        )
        row += 1

        # === Watch Paths ===
        watch_header = ttk.Label(main_frame, text="Log Watch Paths", font=("Segoe UI", 11, "bold"))
        watch_header.grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 5))
        ToolTip(watch_header, "Folders to monitor for log files.\nNew log entries will be shipped to your LogNog server.")
        row += 1

        # Watch paths help
        watch_help = ttk.Label(
            main_frame,
            text="Add folders containing log files. The agent will detect new log entries in real-time.",
            font=("Segoe UI", 8),
            foreground="#666666",
        )
        watch_help.grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 5))
        row += 1

        # Watch paths listbox
        watch_frame = ttk.Frame(main_frame)
        watch_frame.grid(row=row, column=0, columnspan=2, sticky="nsew", pady=5)
        watch_frame.columnconfigure(0, weight=1)

        self.watch_listbox = tk.Listbox(watch_frame, height=5, selectmode=tk.SINGLE, font=("Consolas", 9))
        self.watch_listbox.grid(row=0, column=0, sticky="nsew")

        watch_scroll = ttk.Scrollbar(watch_frame, orient="vertical", command=self.watch_listbox.yview)
        watch_scroll.grid(row=0, column=1, sticky="ns")
        self.watch_listbox.configure(yscrollcommand=watch_scroll.set)

        # Populate watch paths
        for wp in self.config.watch_paths:
            status = "✓" if wp.enabled else "✗"
            self.watch_listbox.insert(tk.END, f"{status} {wp.path} ({wp.pattern})")

        row += 1

        # Watch path buttons
        watch_btn_frame = ttk.Frame(main_frame)
        watch_btn_frame.grid(row=row, column=0, columnspan=2, sticky="w", pady=2)

        add_watch_btn = ttk.Button(watch_btn_frame, text="Add Path...", command=self._add_watch_path)
        add_watch_btn.pack(side="left", padx=2)
        ToolTip(add_watch_btn, "Browse to select a folder to watch for logs")

        remove_watch_btn = ttk.Button(watch_btn_frame, text="Remove", command=self._remove_watch_path)
        remove_watch_btn.pack(side="left", padx=2)
        ToolTip(remove_watch_btn, "Remove the selected path from the list")
        row += 1

        ttk.Separator(main_frame, orient="horizontal").grid(
            row=row, column=0, columnspan=2, sticky="ew", pady=10
        )
        row += 1

        # === FIM Settings ===
        fim_header = ttk.Label(main_frame, text="File Integrity Monitoring (FIM)", font=("Segoe UI", 11, "bold"))
        fim_header.grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 5))
        ToolTip(fim_header, "Monitor files for unauthorized changes.\nDetects when files are created, modified, or deleted.")
        row += 1

        # FIM help
        fim_help = ttk.Label(
            main_frame,
            text="Monitor critical files for changes. Great for security monitoring (/etc, config files, etc.)",
            font=("Segoe UI", 8),
            foreground="#666666",
        )
        fim_help.grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 5))
        row += 1

        # FIM enabled checkbox
        self.fim_enabled = tk.BooleanVar(value=self.config.fim_enabled)
        fim_check = ttk.Checkbutton(main_frame, text="Enable File Integrity Monitoring", variable=self.fim_enabled)
        fim_check.grid(row=row, column=0, columnspan=2, sticky="w")
        ToolTip(fim_check, "When enabled, the agent will track file hashes\nand report any changes to your LogNog server.")
        row += 1

        # FIM paths listbox
        fim_frame = ttk.Frame(main_frame)
        fim_frame.grid(row=row, column=0, columnspan=2, sticky="nsew", pady=5)
        fim_frame.columnconfigure(0, weight=1)

        self.fim_listbox = tk.Listbox(fim_frame, height=4, selectmode=tk.SINGLE, font=("Consolas", 9))
        self.fim_listbox.grid(row=0, column=0, sticky="nsew")

        fim_scroll = ttk.Scrollbar(fim_frame, orient="vertical", command=self.fim_listbox.yview)
        fim_scroll.grid(row=0, column=1, sticky="ns")
        self.fim_listbox.configure(yscrollcommand=fim_scroll.set)

        # Populate FIM paths
        for fp in self.config.fim_paths:
            status = "✓" if fp.enabled else "✗"
            self.fim_listbox.insert(tk.END, f"{status} {fp.path} ({fp.pattern})")

        row += 1

        # FIM path buttons
        fim_btn_frame = ttk.Frame(main_frame)
        fim_btn_frame.grid(row=row, column=0, columnspan=2, sticky="w", pady=2)

        add_fim_btn = ttk.Button(fim_btn_frame, text="Add Path...", command=self._add_fim_path)
        add_fim_btn.pack(side="left", padx=2)
        ToolTip(add_fim_btn, "Browse to select a folder to monitor for file changes")

        remove_fim_btn = ttk.Button(fim_btn_frame, text="Remove", command=self._remove_fim_path)
        remove_fim_btn.pack(side="left", padx=2)
        ToolTip(remove_fim_btn, "Remove the selected path from the list")
        row += 1

        ttk.Separator(main_frame, orient="horizontal").grid(
            row=row, column=0, columnspan=2, sticky="ew", pady=10
        )
        row += 1

        # === Advanced Settings ===
        ttk.Label(main_frame, text="Advanced", font=("Segoe UI", 11, "bold")).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(0, 5)
        )
        row += 1

        # Debug logging
        self.debug_logging = tk.BooleanVar(value=self.config.debug_logging)
        debug_check = ttk.Checkbutton(main_frame, text="Enable debug logging", variable=self.debug_logging)
        debug_check.grid(row=row, column=0, columnspan=2, sticky="w")
        ToolTip(debug_check, "Enable verbose logging for troubleshooting.\nLogs are stored in the agent's log directory.")
        row += 1

        # Start on boot
        self.start_on_boot = tk.BooleanVar(value=self.config.start_on_boot)
        startup_check = ttk.Checkbutton(main_frame, text="Start on Windows boot", variable=self.start_on_boot)
        startup_check.grid(row=row, column=0, columnspan=2, sticky="w")
        ToolTip(startup_check, "Automatically start LogNog In when you log into Windows.\nThe agent will run in the system tray.")
        row += 1

        # Spacer
        main_frame.rowconfigure(row, weight=1)
        row += 1

        # === SOUND ALERTS TAB ===
        self._create_sound_tab(sound_tab)

        # === Buttons ===
        btn_frame = ttk.Frame(notebook)
        btn_frame.grid(row=1, column=0, sticky="e", padx=10, pady=10)

        ttk.Button(btn_frame, text="Save", command=self._save, width=10).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self._close, width=10).pack(side="left", padx=5)

        # Handle window close
        self.window.protocol("WM_DELETE_WINDOW", self._close)

        # Center window
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() - self.window.winfo_width()) // 2
        y = (self.window.winfo_screenheight() - self.window.winfo_height()) // 2
        self.window.geometry(f"+{x}+{y}")

        # Run the window
        self.window.mainloop()

    def _create_sound_tab(self, parent: ttk.Frame) -> None:
        """Create the sound alerts configuration tab."""
        parent.columnconfigure(1, weight=1)
        row = 0

        # === HEADER ===
        header_frame = ttk.Frame(parent)
        header_frame.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(0, 15))

        ttk.Label(
            header_frame,
            text="Sound Alerts",
            font=("Segoe UI", 14, "bold"),
        ).pack(anchor="w")

        ttk.Label(
            header_frame,
            text="Configure sound notifications for alerts",
            font=("Segoe UI", 9),
            foreground="#666666",
        ).pack(anchor="w")
        row += 1

        ttk.Separator(parent, orient="horizontal").grid(
            row=row, column=0, columnspan=2, sticky="ew", pady=(0, 15)
        )
        row += 1

        # === Enable sound alerts ===
        self.sound_alerts_enabled = tk.BooleanVar(value=self.config.sound_alerts_enabled)
        enable_check = ttk.Checkbutton(
            parent,
            text="Enable sound alerts for notifications",
            variable=self.sound_alerts_enabled,
            command=self._on_sound_toggle,
        )
        enable_check.grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 10))
        ToolTip(enable_check, "Play sounds when alert notifications are received from the server")
        row += 1

        # === Volume control ===
        ttk.Label(parent, text="Volume:").grid(row=row, column=0, sticky="w", pady=5)

        volume_frame = ttk.Frame(parent)
        volume_frame.grid(row=row, column=1, sticky="ew", pady=5)

        self.sound_volume = tk.IntVar(value=self.config.sound_volume)
        volume_slider = ttk.Scale(
            volume_frame,
            from_=0,
            to=100,
            orient="horizontal",
            variable=self.sound_volume,
        )
        volume_slider.pack(side="left", fill="x", expand=True, padx=(0, 10))

        self.volume_label = ttk.Label(volume_frame, text=f"{self.sound_volume.get()}%", width=5)
        self.volume_label.pack(side="left")

        # Update label when slider moves
        def update_volume_label(*args):
            self.volume_label.configure(text=f"{self.sound_volume.get()}%")
        self.sound_volume.trace_add("write", update_volume_label)

        row += 1

        ttk.Separator(parent, orient="horizontal").grid(
            row=row, column=0, columnspan=2, sticky="ew", pady=15
        )
        row += 1

        # === Sound configuration for each severity ===
        ttk.Label(
            parent,
            text="Sounds by Severity Level",
            font=("Segoe UI", 11, "bold"),
        ).grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 10))
        row += 1

        help_text = ttk.Label(
            parent,
            text='Select "Default Beep" for built-in system sounds, or choose custom .wav files',
            font=("Segoe UI", 8),
            foreground="#666666",
        )
        help_text.grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 10))
        row += 1

        # Store sound path variables
        self.sound_paths = {}

        # Create config for each severity
        severities = [
            ("Critical", "critical", "High-priority alerts", "#d32f2f"),
            ("Error", "error", "Error-level alerts", "#f57c00"),
            ("Warning", "warning", "Warning-level alerts", "#fbc02d"),
            ("Info", "info", "Informational alerts", "#1976d2"),
        ]

        for label, severity, tooltip, color in severities:
            # Severity label with color
            severity_frame = ttk.Frame(parent)
            severity_frame.grid(row=row, column=0, columnspan=2, sticky="ew", pady=5)

            severity_label = ttk.Label(
                severity_frame,
                text=f"{label}:",
                font=("Segoe UI", 10),
                foreground=color,
            )
            severity_label.pack(side="left", padx=(0, 10))
            ToolTip(severity_label, tooltip)

            # Sound selection
            sound_path = getattr(self.config, f"sound_{severity}", "default")
            self.sound_paths[severity] = tk.StringVar(value=sound_path)

            # Display name for path
            display_name = "Default Beep" if sound_path == "default" else Path(sound_path).name if sound_path else "None"

            path_label = ttk.Label(severity_frame, text=display_name, width=30, anchor="w", relief="sunken")
            path_label.pack(side="left", padx=5)

            # Browse button
            browse_btn = ttk.Button(
                severity_frame,
                text="Browse...",
                command=lambda s=severity, pl=path_label: self._browse_sound(s, pl),
                width=10,
            )
            browse_btn.pack(side="left", padx=2)

            # Default button
            default_btn = ttk.Button(
                severity_frame,
                text="Default",
                command=lambda s=severity, pl=path_label: self._set_default_sound(s, pl),
                width=10,
            )
            default_btn.pack(side="left", padx=2)

            # Test button
            test_btn = ttk.Button(
                severity_frame,
                text="Test",
                command=lambda s=severity: self._test_sound(s),
                width=8,
            )
            test_btn.pack(side="left", padx=2)

            row += 1

        # Add spacer
        parent.rowconfigure(row, weight=1)

    def _on_sound_toggle(self) -> None:
        """Handle sound alerts enable/disable toggle."""
        pass  # Just update the variable

    def _browse_sound(self, severity: str, label: ttk.Label) -> None:
        """Browse for a custom sound file."""
        file_path = filedialog.askopenfilename(
            title=f"Select sound for {severity} alerts",
            filetypes=[("WAV files", "*.wav"), ("All files", "*.*")],
        )
        if file_path:
            self.sound_paths[severity].set(file_path)
            label.configure(text=Path(file_path).name)

    def _set_default_sound(self, severity: str, label: ttk.Label) -> None:
        """Set default beep for a severity."""
        self.sound_paths[severity].set("default")
        label.configure(text="Default Beep")

    def _test_sound(self, severity: str) -> None:
        """Test the sound for a severity level."""
        from .sound_alerts import SoundAlertPlayer, Severity

        sound_path = self.sound_paths[severity].get()
        volume = self.sound_volume.get()

        # Map severity string to enum
        severity_map = {
            "critical": Severity.CRITICAL,
            "error": Severity.ERROR,
            "warning": Severity.WARNING,
            "info": Severity.INFO,
        }
        sev = severity_map.get(severity, Severity.INFO)

        # Play test sound
        player = SoundAlertPlayer()
        if not player.is_available():
            messagebox.showwarning(
                "Sound Not Available",
                "No audio backend is available on this system.\n\n"
                "Sound alerts require either:\n"
                "- Windows (winsound built-in)\n"
                "- pygame library installed",
            )
            return

        try:
            success = player.test_sound(sound_path, sev, volume)
            if not success:
                messagebox.showerror("Test Failed", "Could not play sound.\n\nCheck the file path and format (.wav only).")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to test sound: {e}")

    def _test_connection(self) -> None:
        """Test the server connection."""
        import httpx

        server = self.server_url.get().strip()
        api_key = self.api_key.get().strip()

        if not server:
            messagebox.showerror("Error", "Please enter a server URL")
            return

        try:
            # Test health endpoint
            response = httpx.get(f"{server}/health", timeout=10.0)
            if response.status_code != 200:
                messagebox.showerror("Error", f"Server returned: {response.status_code}")
                return

            # Test auth if API key provided
            if api_key:
                response = httpx.get(
                    f"{server}/auth/me",
                    headers={"Authorization": f"ApiKey {api_key}"},
                    timeout=10.0,
                )
                if response.status_code == 401:
                    messagebox.showerror("Error", "Authentication failed - check API key")
                    return
                elif response.status_code != 200:
                    messagebox.showwarning("Warning", f"Auth check returned: {response.status_code}")

            messagebox.showinfo("Success", "Connection successful!")

        except httpx.ConnectError:
            messagebox.showerror("Error", f"Cannot connect to {server}")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def _add_watch_path(self) -> None:
        """Add a new watch path."""
        path = filedialog.askdirectory(title="Select folder to watch for logs")
        if path:
            # Ask for pattern
            pattern = tk.simpledialog.askstring(
                "Pattern",
                "File pattern (e.g., *.log, *.txt):",
                initialvalue="*.log",
            )
            if pattern:
                wp = WatchPath(path=path, pattern=pattern)
                self.config.watch_paths.append(wp)
                self.watch_listbox.insert(tk.END, f"✓ {path} ({pattern})")

    def _remove_watch_path(self) -> None:
        """Remove selected watch path."""
        selection = self.watch_listbox.curselection()
        if selection:
            idx = selection[0]
            self.watch_listbox.delete(idx)
            if idx < len(self.config.watch_paths):
                del self.config.watch_paths[idx]

    def _add_fim_path(self) -> None:
        """Add a new FIM path."""
        path = filedialog.askdirectory(title="Select folder to monitor for integrity")
        if path:
            pattern = tk.simpledialog.askstring(
                "Pattern",
                "File pattern (e.g., *, *.conf, *.exe):",
                initialvalue="*",
            )
            if pattern:
                fp = FIMPath(path=path, pattern=pattern)
                self.config.fim_paths.append(fp)
                self.fim_listbox.insert(tk.END, f"✓ {path} ({pattern})")

    def _remove_fim_path(self) -> None:
        """Remove selected FIM path."""
        selection = self.fim_listbox.curselection()
        if selection:
            idx = selection[0]
            self.fim_listbox.delete(idx)
            if idx < len(self.config.fim_paths):
                del self.config.fim_paths[idx]

    def _save(self) -> None:
        """Save the configuration."""
        # Update config from UI
        self.config.server_url = self.server_url.get().strip()
        self.config.api_key = self.api_key.get().strip()
        self.config.fim_enabled = self.fim_enabled.get()
        self.config.debug_logging = self.debug_logging.get()
        self.config.start_on_boot = self.start_on_boot.get()

        # Update sound settings
        self.config.sound_alerts_enabled = self.sound_alerts_enabled.get()
        self.config.sound_volume = self.sound_volume.get()
        self.config.sound_critical = self.sound_paths.get("critical", tk.StringVar(value="default")).get()
        self.config.sound_error = self.sound_paths.get("error", tk.StringVar(value="default")).get()
        self.config.sound_warning = self.sound_paths.get("warning", tk.StringVar(value="default")).get()
        self.config.sound_info = self.sound_paths.get("info", tk.StringVar(value="default")).get()

        # Handle start on boot
        self._update_startup_registry()

        # Save to file
        try:
            self.config.save()
            messagebox.showinfo("Saved", "Configuration saved successfully!\n\nRestart the agent for changes to take effect.")

            if self.on_save:
                self.on_save(self.config)

            self._close()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save: {e}")

    def _update_startup_registry(self) -> None:
        """Update Windows startup registry."""
        import sys
        import winreg

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "LogNogIn"

        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)

            if self.config.start_on_boot:
                # Get the executable path
                if getattr(sys, 'frozen', False):
                    exe_path = sys.executable
                else:
                    exe_path = sys.argv[0]
                winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, f'"{exe_path}"')
            else:
                try:
                    winreg.DeleteValue(key, app_name)
                except FileNotFoundError:
                    pass

            winreg.CloseKey(key)
        except Exception as e:
            logger.error(f"Failed to update startup registry: {e}")

    def _close(self) -> None:
        """Close the window."""
        if self.window:
            self.window.destroy()
            self.window = None

        if self.on_close:
            self.on_close()


class AlertHistoryWindow:
    """Window to display alert notification history."""

    def __init__(self, alerts: list[dict]):
        self.alerts = alerts
        self.window: Optional[tk.Tk] = None
        self._thread: Optional[threading.Thread] = None

    def show(self) -> None:
        """Show the alert history window."""
        if self.window is not None:
            try:
                self.window.lift()
                self.window.focus_force()
                return
            except tk.TclError:
                pass

        self._thread = threading.Thread(target=self._create_window, daemon=True)
        self._thread.start()

    def _create_window(self) -> None:
        """Create and run the alert history window."""
        self.window = tk.Tk()
        self.window.title("LogNog In - Alert History")
        self.window.geometry("600x400")
        self.window.resizable(True, True)
        self.window.configure(bg="#f0f0f0")

        # Set icon if available
        icon_path = get_asset_path("lognog.ico")
        if icon_path:
            try:
                self.window.iconbitmap(str(icon_path))
            except Exception:
                pass

        # Create main frame
        main_frame = ttk.Frame(self.window, padding="10")
        main_frame.pack(fill="both", expand=True)

        # Header
        header_frame = ttk.Frame(main_frame)
        header_frame.pack(fill="x", pady=(0, 10))

        ttk.Label(
            header_frame,
            text="Alert History",
            font=("Segoe UI", 14, "bold"),
        ).pack(side="left")

        ttk.Label(
            header_frame,
            text=f"({len(self.alerts)} alerts)",
            font=("Segoe UI", 10),
            foreground="#666666",
        ).pack(side="left", padx=(10, 0))

        # Alerts list with treeview
        columns = ("time", "severity", "title", "message")
        tree = ttk.Treeview(main_frame, columns=columns, show="headings", height=15)

        tree.heading("time", text="Time")
        tree.heading("severity", text="Severity")
        tree.heading("title", text="Title")
        tree.heading("message", text="Message")

        tree.column("time", width=140, minwidth=100)
        tree.column("severity", width=70, minwidth=60)
        tree.column("title", width=150, minwidth=100)
        tree.column("message", width=220, minwidth=150)

        # Scrollbar
        scrollbar = ttk.Scrollbar(main_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)

        tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Populate alerts
        for alert in self.alerts:
            timestamp = alert.get("timestamp", "")
            if timestamp:
                # Format timestamp to be more readable
                try:
                    from datetime import datetime
                    dt = datetime.fromisoformat(timestamp)
                    timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    pass

            severity = alert.get("severity", "medium").upper()
            title = alert.get("title", "")
            message = alert.get("message", "")

            # Truncate long messages
            if len(message) > 100:
                message = message[:97] + "..."

            tree.insert("", "end", values=(timestamp, severity, title, message))

        # Show message if no alerts
        if not self.alerts:
            tree.insert("", "end", values=("", "", "No alerts received", ""))

        # Close button
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(fill="x", pady=(10, 0))

        ttk.Button(btn_frame, text="Close", command=self._close, width=10).pack(side="right")

        # Handle window close
        self.window.protocol("WM_DELETE_WINDOW", self._close)

        # Center window
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() - self.window.winfo_width()) // 2
        y = (self.window.winfo_screenheight() - self.window.winfo_height()) // 2
        self.window.geometry(f"+{x}+{y}")

        self.window.mainloop()

    def _close(self) -> None:
        """Close the window."""
        if self.window:
            self.window.destroy()
            self.window = None


# Simple dialog for pattern input (tkinter.simpledialog might not be available)
try:
    from tkinter import simpledialog
except ImportError:
    # Fallback implementation
    class simpledialog:
        @staticmethod
        def askstring(title, prompt, initialvalue=""):
            dialog = tk.Toplevel()
            dialog.title(title)
            dialog.geometry("300x100")
            dialog.transient()
            dialog.grab_set()

            result = [None]

            ttk.Label(dialog, text=prompt).pack(pady=5)
            entry = ttk.Entry(dialog, width=30)
            entry.insert(0, initialvalue)
            entry.pack(pady=5)

            def on_ok():
                result[0] = entry.get()
                dialog.destroy()

            ttk.Button(dialog, text="OK", command=on_ok).pack(pady=5)

            dialog.wait_window()
            return result[0]

    tk.simpledialog = simpledialog
