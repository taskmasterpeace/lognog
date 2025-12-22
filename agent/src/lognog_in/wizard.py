"""First-run setup wizard for LogNog In agent."""

import logging
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog
from pathlib import Path
from typing import Optional, Callable, Dict, Any
import webbrowser
import urllib.request
import urllib.error
import json

from .config import Config, WatchPath

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


class SetupWizard:
    """First-run setup wizard for LogNog In."""

    STEPS = [
        "welcome",
        "server",
        "apikey",
        "monitoring",
        "verify",
        "complete"
    ]

    def __init__(
        self,
        config: Config,
        on_complete: Optional[Callable[[], None]] = None,
        on_skip: Optional[Callable[[], None]] = None,
    ):
        self.config = config
        self.on_complete = on_complete
        self.on_skip = on_skip
        self.window: Optional[tk.Tk] = None
        self._thread: Optional[threading.Thread] = None
        self.current_step = 0

        # Collected data
        self.data: Dict[str, Any] = {
            "server_url": "http://localhost:4000",
            "api_key": "",
            "watch_enabled": True,
            "watch_path": "",
            "watch_pattern": "*.log",
            "windows_events_enabled": False,
            "windows_events_channels": [],
            "fim_enabled": False,
            "fim_path": "",
        }

    def show(self) -> None:
        """Show the setup wizard."""
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
        """Create and run the wizard window."""
        self.window = tk.Tk()
        self.window.title("LogNog In Setup")
        self.window.geometry("550x480")
        self.window.resizable(False, False)
        self.window.configure(bg="#ffffff")

        # Center window
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() - 550) // 2
        y = (self.window.winfo_screenheight() - 480) // 2
        self.window.geometry(f"550x480+{x}+{y}")

        # Try to set icon
        icon_path = get_asset_path("icon.ico")
        if icon_path:
            try:
                self.window.iconbitmap(str(icon_path))
            except Exception:
                pass

        # Main container
        self.main_frame = ttk.Frame(self.window, padding=20)
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # Content area (changes per step)
        self.content_frame = ttk.Frame(self.main_frame)
        self.content_frame.pack(fill=tk.BOTH, expand=True)

        # Progress bar at bottom
        self.progress_frame = ttk.Frame(self.main_frame)
        self.progress_frame.pack(fill=tk.X, pady=(20, 0))

        self._render_step()

        self.window.protocol("WM_DELETE_WINDOW", self._on_close)
        self.window.mainloop()

    def _on_close(self) -> None:
        """Handle window close."""
        if self.window:
            self.window.destroy()
            self.window = None
        if self.on_skip:
            self.on_skip()

    def _clear_content(self) -> None:
        """Clear the content frame."""
        for widget in self.content_frame.winfo_children():
            widget.destroy()
        for widget in self.progress_frame.winfo_children():
            widget.destroy()

    def _render_step(self) -> None:
        """Render the current step."""
        self._clear_content()

        step_name = self.STEPS[self.current_step]

        if step_name == "welcome":
            self._render_welcome()
        elif step_name == "server":
            self._render_server()
        elif step_name == "apikey":
            self._render_apikey()
        elif step_name == "monitoring":
            self._render_monitoring()
        elif step_name == "verify":
            self._render_verify()
        elif step_name == "complete":
            self._render_complete()

        # Progress indicator (skip for welcome and complete)
        if step_name not in ["welcome", "complete"]:
            self._render_progress()

    def _render_progress(self) -> None:
        """Render progress indicator."""
        step_num = self.current_step
        total = len(self.STEPS) - 2  # Exclude welcome and complete

        progress_label = ttk.Label(
            self.progress_frame,
            text=f"Step {step_num} of {total}",
            font=("Segoe UI", 9)
        )
        progress_label.pack(side=tk.LEFT)

        # Progress bar
        progress = ttk.Progressbar(
            self.progress_frame,
            length=200,
            mode="determinate",
            value=(step_num / total) * 100
        )
        progress.pack(side=tk.RIGHT)

    def _render_welcome(self) -> None:
        """Render welcome step."""
        # Logo placeholder
        logo_frame = ttk.Frame(self.content_frame)
        logo_frame.pack(pady=(20, 30))

        title = ttk.Label(
            logo_frame,
            text="LogNog In",
            font=("Segoe UI", 28, "bold")
        )
        title.pack()

        # Welcome message
        welcome = ttk.Label(
            self.content_frame,
            text="Welcome to LogNog In!",
            font=("Segoe UI", 16)
        )
        welcome.pack(pady=(0, 20))

        desc = ttk.Label(
            self.content_frame,
            text="This wizard will help you set up log monitoring\nin just a few simple steps.",
            font=("Segoe UI", 11),
            justify=tk.CENTER
        )
        desc.pack(pady=(0, 20))

        # What we'll do
        steps_frame = ttk.LabelFrame(self.content_frame, text="We'll help you:", padding=15)
        steps_frame.pack(fill=tk.X, pady=20)

        steps = [
            "Connect to your LogNog server",
            "Set up your API key for authentication",
            "Choose what logs to monitor",
            "Verify everything works"
        ]

        for step in steps:
            step_label = ttk.Label(steps_frame, text=f"  {step}", font=("Segoe UI", 10))
            step_label.pack(anchor=tk.W, pady=2)

        # Buttons
        btn_frame = ttk.Frame(self.content_frame)
        btn_frame.pack(pady=30)

        skip_btn = ttk.Button(
            btn_frame,
            text="Skip for Now",
            command=self._skip_wizard,
            width=15
        )
        skip_btn.pack(side=tk.LEFT, padx=10)

        start_btn = ttk.Button(
            btn_frame,
            text="Get Started",
            command=self._next_step,
            width=15
        )
        start_btn.pack(side=tk.LEFT, padx=10)

    def _render_server(self) -> None:
        """Render server URL step."""
        title = ttk.Label(
            self.content_frame,
            text="Server Connection",
            font=("Segoe UI", 16, "bold")
        )
        title.pack(pady=(10, 20))

        desc = ttk.Label(
            self.content_frame,
            text="Enter the URL of your LogNog server:",
            font=("Segoe UI", 10)
        )
        desc.pack(pady=(0, 10))

        # URL entry
        self.server_var = tk.StringVar(value=self.data["server_url"])
        url_entry = ttk.Entry(
            self.content_frame,
            textvariable=self.server_var,
            width=50,
            font=("Consolas", 11)
        )
        url_entry.pack(pady=10)
        url_entry.focus()

        # Common options
        hint_frame = ttk.LabelFrame(self.content_frame, text="Common options:", padding=10)
        hint_frame.pack(fill=tk.X, pady=20)

        hints = [
            ("http://localhost:4000", "LogNog running on this PC"),
            ("http://192.168.1.x:4000", "LogNog on your local network"),
            ("https://logs.example.com", "Remote LogNog with HTTPS"),
        ]

        for url, desc in hints:
            hint_row = ttk.Frame(hint_frame)
            hint_row.pack(fill=tk.X, pady=2)

            url_label = ttk.Label(hint_row, text=url, font=("Consolas", 9), foreground="#0066cc")
            url_label.pack(side=tk.LEFT)
            url_label.bind("<Button-1>", lambda e, u=url: self.server_var.set(u))
            url_label.bind("<Enter>", lambda e, l=url_label: l.configure(cursor="hand2"))

            desc_label = ttk.Label(hint_row, text=f"  - {desc}", font=("Segoe UI", 9))
            desc_label.pack(side=tk.LEFT)

        # Status label for test result
        self.server_status = ttk.Label(self.content_frame, text="", font=("Segoe UI", 10))
        self.server_status.pack(pady=10)

        # Buttons
        btn_frame = ttk.Frame(self.content_frame)
        btn_frame.pack(pady=20)

        back_btn = ttk.Button(btn_frame, text="Back", command=self._prev_step, width=12)
        back_btn.pack(side=tk.LEFT, padx=5)

        test_btn = ttk.Button(btn_frame, text="Test Connection", command=self._test_server, width=15)
        test_btn.pack(side=tk.LEFT, padx=5)

        next_btn = ttk.Button(btn_frame, text="Next", command=self._validate_server, width=12)
        next_btn.pack(side=tk.LEFT, padx=5)

    def _test_server(self) -> None:
        """Test server connection."""
        url = self.server_var.get().strip().rstrip("/")
        self.server_status.configure(text="Testing connection...", foreground="#666666")
        self.window.update()

        try:
            req = urllib.request.Request(f"{url}/health", method="GET")
            req.add_header("User-Agent", "LogNogIn-Wizard/1.0")
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    self.server_status.configure(text="Connection successful!", foreground="#008800")
                else:
                    self.server_status.configure(text=f"Server returned status {response.status}", foreground="#cc0000")
        except urllib.error.URLError as e:
            self.server_status.configure(text=f"Connection failed: {e.reason}", foreground="#cc0000")
        except Exception as e:
            self.server_status.configure(text=f"Error: {str(e)}", foreground="#cc0000")

    def _validate_server(self) -> None:
        """Validate server URL and proceed."""
        url = self.server_var.get().strip().rstrip("/")
        if not url:
            self.server_status.configure(text="Please enter a server URL", foreground="#cc0000")
            return

        if not url.startswith("http://") and not url.startswith("https://"):
            self.server_status.configure(text="URL must start with http:// or https://", foreground="#cc0000")
            return

        self.data["server_url"] = url
        self._next_step()

    def _render_apikey(self) -> None:
        """Render API key step."""
        title = ttk.Label(
            self.content_frame,
            text="API Key",
            font=("Segoe UI", 16, "bold")
        )
        title.pack(pady=(10, 20))

        desc = ttk.Label(
            self.content_frame,
            text="Enter your LogNog API key:",
            font=("Segoe UI", 10)
        )
        desc.pack(pady=(0, 10))

        # API key entry
        self.apikey_var = tk.StringVar(value=self.data["api_key"])
        key_entry = ttk.Entry(
            self.content_frame,
            textvariable=self.apikey_var,
            width=50,
            font=("Consolas", 11),
            show="*"
        )
        key_entry.pack(pady=10)
        key_entry.focus()

        # Show/hide toggle
        self.show_key = tk.BooleanVar(value=False)
        show_check = ttk.Checkbutton(
            self.content_frame,
            text="Show API key",
            variable=self.show_key,
            command=lambda: key_entry.configure(show="" if self.show_key.get() else "*")
        )
        show_check.pack(pady=5)

        # Instructions
        inst_frame = ttk.LabelFrame(self.content_frame, text="How to get your API key:", padding=10)
        inst_frame.pack(fill=tk.X, pady=15)

        instructions = [
            "1. Open LogNog in your browser",
            "2. Go to Settings (gear icon)",
            "3. Click 'API Keys' section",
            "4. Click 'New Key' button",
            "5. Name it (e.g., 'My PC Agent')",
            "6. Select 'write' permission",
            "7. Copy the key (shown only once!)"
        ]

        for inst in instructions:
            inst_label = ttk.Label(inst_frame, text=inst, font=("Segoe UI", 9))
            inst_label.pack(anchor=tk.W, pady=1)

        # Open browser button
        open_btn = ttk.Button(
            self.content_frame,
            text="Open LogNog Settings",
            command=self._open_settings
        )
        open_btn.pack(pady=10)

        # Status label
        self.apikey_status = ttk.Label(self.content_frame, text="", font=("Segoe UI", 10))
        self.apikey_status.pack(pady=5)

        # Buttons
        btn_frame = ttk.Frame(self.content_frame)
        btn_frame.pack(pady=10)

        back_btn = ttk.Button(btn_frame, text="Back", command=self._prev_step, width=12)
        back_btn.pack(side=tk.LEFT, padx=5)

        next_btn = ttk.Button(btn_frame, text="Next", command=self._validate_apikey, width=12)
        next_btn.pack(side=tk.LEFT, padx=5)

    def _open_settings(self) -> None:
        """Open LogNog settings in browser."""
        url = self.data["server_url"].rstrip("/")
        # Convert API URL to web UI URL
        if ":4000" in url:
            web_url = url.replace(":4000", "")
        else:
            web_url = url
        webbrowser.open(f"{web_url}/settings")

    def _validate_apikey(self) -> None:
        """Validate API key and proceed."""
        key = self.apikey_var.get().strip()
        if not key:
            self.apikey_status.configure(text="Please enter an API key", foreground="#cc0000")
            return

        self.data["api_key"] = key
        self._next_step()

    def _render_monitoring(self) -> None:
        """Render monitoring options step."""
        title = ttk.Label(
            self.content_frame,
            text="What to Monitor",
            font=("Segoe UI", 16, "bold")
        )
        title.pack(pady=(10, 20))

        desc = ttk.Label(
            self.content_frame,
            text="Choose what you want LogNog In to monitor:",
            font=("Segoe UI", 10)
        )
        desc.pack(pady=(0, 15))

        # Watch log files
        watch_frame = ttk.LabelFrame(self.content_frame, text="Watch Log Files", padding=10)
        watch_frame.pack(fill=tk.X, pady=5)

        self.watch_enabled = tk.BooleanVar(value=self.data["watch_enabled"])
        watch_check = ttk.Checkbutton(
            watch_frame,
            text="Enable file watching",
            variable=self.watch_enabled
        )
        watch_check.pack(anchor=tk.W)

        path_row = ttk.Frame(watch_frame)
        path_row.pack(fill=tk.X, pady=5)

        ttk.Label(path_row, text="Path:", width=8).pack(side=tk.LEFT)
        self.watch_path_var = tk.StringVar(value=self.data["watch_path"])
        path_entry = ttk.Entry(path_row, textvariable=self.watch_path_var, width=35)
        path_entry.pack(side=tk.LEFT, padx=5)

        browse_btn = ttk.Button(
            path_row,
            text="Browse...",
            command=lambda: self._browse_folder(self.watch_path_var)
        )
        browse_btn.pack(side=tk.LEFT)

        pattern_row = ttk.Frame(watch_frame)
        pattern_row.pack(fill=tk.X, pady=5)

        ttk.Label(pattern_row, text="Pattern:", width=8).pack(side=tk.LEFT)
        self.watch_pattern_var = tk.StringVar(value=self.data["watch_pattern"])
        pattern_entry = ttk.Entry(pattern_row, textvariable=self.watch_pattern_var, width=20)
        pattern_entry.pack(side=tk.LEFT, padx=5)
        ttk.Label(pattern_row, text="(e.g., *.log, *.txt)", font=("Segoe UI", 9)).pack(side=tk.LEFT)

        # Windows Event Logs (only on Windows)
        if sys.platform == "win32":
            events_frame = ttk.LabelFrame(self.content_frame, text="Windows Event Logs", padding=10)
            events_frame.pack(fill=tk.X, pady=5)

            self.events_enabled = tk.BooleanVar(value=self.data["windows_events_enabled"])
            events_check = ttk.Checkbutton(
                events_frame,
                text="Collect Windows Event Logs",
                variable=self.events_enabled
            )
            events_check.pack(anchor=tk.W)

            channels_row = ttk.Frame(events_frame)
            channels_row.pack(fill=tk.X, pady=5)

            self.channel_vars = {}
            for channel in ["Security", "System", "Application"]:
                var = tk.BooleanVar(value=channel in self.data["windows_events_channels"])
                self.channel_vars[channel] = var
                cb = ttk.Checkbutton(channels_row, text=channel, variable=var)
                cb.pack(side=tk.LEFT, padx=10)

        # Status
        self.monitor_status = ttk.Label(self.content_frame, text="", font=("Segoe UI", 10))
        self.monitor_status.pack(pady=10)

        # Buttons
        btn_frame = ttk.Frame(self.content_frame)
        btn_frame.pack(pady=15)

        back_btn = ttk.Button(btn_frame, text="Back", command=self._prev_step, width=12)
        back_btn.pack(side=tk.LEFT, padx=5)

        next_btn = ttk.Button(btn_frame, text="Next", command=self._validate_monitoring, width=12)
        next_btn.pack(side=tk.LEFT, padx=5)

    def _browse_folder(self, var: tk.StringVar) -> None:
        """Open folder browser dialog."""
        folder = filedialog.askdirectory()
        if folder:
            var.set(folder)

    def _validate_monitoring(self) -> None:
        """Validate monitoring options."""
        self.data["watch_enabled"] = self.watch_enabled.get()
        self.data["watch_path"] = self.watch_path_var.get().strip()
        self.data["watch_pattern"] = self.watch_pattern_var.get().strip() or "*.log"

        if sys.platform == "win32" and hasattr(self, 'events_enabled'):
            self.data["windows_events_enabled"] = self.events_enabled.get()
            self.data["windows_events_channels"] = [
                ch for ch, var in self.channel_vars.items() if var.get()
            ]

        # Validate at least one option
        has_watch = self.data["watch_enabled"] and self.data["watch_path"]
        has_events = self.data.get("windows_events_enabled", False)

        if not has_watch and not has_events:
            self.monitor_status.configure(
                text="Please configure at least one monitoring option",
                foreground="#cc0000"
            )
            return

        if has_watch and not Path(self.data["watch_path"]).exists():
            self.monitor_status.configure(
                text="Warning: Watch path doesn't exist (will be created)",
                foreground="#cc8800"
            )

        self._next_step()

    def _render_verify(self) -> None:
        """Render verification step."""
        title = ttk.Label(
            self.content_frame,
            text="Verify Setup",
            font=("Segoe UI", 16, "bold")
        )
        title.pack(pady=(10, 20))

        desc = ttk.Label(
            self.content_frame,
            text="Testing your configuration...",
            font=("Segoe UI", 10)
        )
        desc.pack(pady=(0, 20))

        # Status items
        self.verify_frame = ttk.Frame(self.content_frame)
        self.verify_frame.pack(fill=tk.X, pady=10, padx=40)

        self.verify_items = {}
        checks = [
            ("server", "Server reachable"),
            ("auth", "API key valid"),
            ("test_log", "Sending test log"),
        ]

        for key, text in checks:
            row = ttk.Frame(self.verify_frame)
            row.pack(fill=tk.X, pady=5)

            status_label = ttk.Label(row, text="...", width=3, font=("Segoe UI", 12))
            status_label.pack(side=tk.LEFT)

            text_label = ttk.Label(row, text=text, font=("Segoe UI", 11))
            text_label.pack(side=tk.LEFT, padx=10)

            self.verify_items[key] = status_label

        # Result message
        self.verify_result = ttk.Label(
            self.content_frame,
            text="",
            font=("Segoe UI", 10),
            wraplength=400
        )
        self.verify_result.pack(pady=20)

        # Buttons
        btn_frame = ttk.Frame(self.content_frame)
        btn_frame.pack(pady=15)

        self.verify_back_btn = ttk.Button(btn_frame, text="Back", command=self._prev_step, width=12)
        self.verify_back_btn.pack(side=tk.LEFT, padx=5)

        self.verify_finish_btn = ttk.Button(btn_frame, text="Finish", command=self._finish_setup, width=12, state=tk.DISABLED)
        self.verify_finish_btn.pack(side=tk.LEFT, padx=5)

        # Run verification
        self.window.after(500, self._run_verification)

    def _run_verification(self) -> None:
        """Run verification checks."""
        url = self.data["server_url"]
        api_key = self.data["api_key"]

        # Check 1: Server reachable
        try:
            req = urllib.request.Request(f"{url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    self.verify_items["server"].configure(text="\u2705")  # Checkmark
                else:
                    self.verify_items["server"].configure(text="\u274c")  # X
                    self.verify_result.configure(text=f"Server returned status {response.status}", foreground="#cc0000")
                    return
        except Exception as e:
            self.verify_items["server"].configure(text="\u274c")
            self.verify_result.configure(text=f"Cannot reach server: {e}", foreground="#cc0000")
            return

        self.window.update()

        # Check 2: API key valid
        try:
            req = urllib.request.Request(f"{url}/api/auth/verify", method="GET")
            req.add_header("Authorization", f"ApiKey {api_key}")
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    self.verify_items["auth"].configure(text="\u2705")
                else:
                    self.verify_items["auth"].configure(text="\u274c")
                    self.verify_result.configure(text="API key is invalid", foreground="#cc0000")
                    return
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self.verify_items["auth"].configure(text="\u274c")
                self.verify_result.configure(text="API key is invalid or expired", foreground="#cc0000")
                return
            self.verify_items["auth"].configure(text="\u274c")
            self.verify_result.configure(text=f"Auth check failed: {e}", foreground="#cc0000")
            return
        except Exception as e:
            self.verify_items["auth"].configure(text="\u274c")
            self.verify_result.configure(text=f"Auth check error: {e}", foreground="#cc0000")
            return

        self.window.update()

        # Check 3: Send test log
        try:
            import socket
            test_log = {
                "events": [{
                    "timestamp": None,  # Server will set
                    "hostname": socket.gethostname(),
                    "app_name": "lognog-in-wizard",
                    "message": "LogNog In setup wizard test log - if you see this, the agent is configured correctly!",
                    "severity": 6,
                    "source_type": "agent"
                }]
            }

            data = json.dumps(test_log).encode("utf-8")
            req = urllib.request.Request(f"{url}/api/ingest/agent", data=data, method="POST")
            req.add_header("Authorization", f"ApiKey {api_key}")
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status in [200, 201]:
                    self.verify_items["test_log"].configure(text="\u2705")
                else:
                    self.verify_items["test_log"].configure(text="\u274c")
                    self.verify_result.configure(text="Failed to send test log", foreground="#cc0000")
                    return
        except Exception as e:
            self.verify_items["test_log"].configure(text="\u274c")
            self.verify_result.configure(text=f"Failed to send test log: {e}", foreground="#cc0000")
            return

        # All checks passed
        self.verify_result.configure(
            text="All checks passed! Click Finish to save your configuration.",
            foreground="#008800"
        )
        self.verify_finish_btn.configure(state=tk.NORMAL)

    def _finish_setup(self) -> None:
        """Save configuration and finish wizard."""
        # Save to config
        self.config.set("server_url", self.data["server_url"])
        self.config.set("api_key", self.data["api_key"])

        # Set up watch paths
        if self.data["watch_enabled"] and self.data["watch_path"]:
            watch_paths = self.config.get("watch_paths", [])
            new_path = {
                "path": self.data["watch_path"],
                "patterns": [self.data["watch_pattern"]],
                "recursive": True
            }
            # Check if already exists
            if not any(wp.get("path") == self.data["watch_path"] for wp in watch_paths):
                watch_paths.append(new_path)
                self.config.set("watch_paths", watch_paths)

        # Set up Windows events
        if self.data.get("windows_events_enabled") and self.data.get("windows_events_channels"):
            self.config.set("windows_events", {
                "enabled": True,
                "channels": self.data["windows_events_channels"]
            })

        # Mark wizard complete
        self.config.set("_wizard_completed", True)
        self.config.save()

        self._next_step()

    def _render_complete(self) -> None:
        """Render completion step."""
        # Success icon
        success_label = ttk.Label(
            self.content_frame,
            text="\U0001F389",  # Party popper emoji
            font=("Segoe UI", 48)
        )
        success_label.pack(pady=(20, 10))

        title = ttk.Label(
            self.content_frame,
            text="You're All Set!",
            font=("Segoe UI", 20, "bold")
        )
        title.pack(pady=(0, 20))

        desc = ttk.Label(
            self.content_frame,
            text="LogNog In is now configured and ready to monitor your logs.",
            font=("Segoe UI", 11),
            justify=tk.CENTER
        )
        desc.pack(pady=(0, 20))

        # Summary
        summary_frame = ttk.LabelFrame(self.content_frame, text="Configuration Summary", padding=10)
        summary_frame.pack(fill=tk.X, pady=10)

        ttk.Label(summary_frame, text=f"Server: {self.data['server_url']}", font=("Segoe UI", 10)).pack(anchor=tk.W)

        if self.data["watch_enabled"] and self.data["watch_path"]:
            ttk.Label(summary_frame, text=f"Watching: {self.data['watch_path']}/{self.data['watch_pattern']}", font=("Segoe UI", 10)).pack(anchor=tk.W)

        if self.data.get("windows_events_enabled"):
            channels = ", ".join(self.data.get("windows_events_channels", []))
            ttk.Label(summary_frame, text=f"Windows Events: {channels}", font=("Segoe UI", 10)).pack(anchor=tk.W)

        # Next steps
        next_frame = ttk.Frame(self.content_frame)
        next_frame.pack(fill=tk.X, pady=20)

        ttk.Label(
            next_frame,
            text="The agent runs in your system tray.\nDouble-click the tray icon to change settings.",
            font=("Segoe UI", 10),
            justify=tk.CENTER
        ).pack()

        # Buttons
        btn_frame = ttk.Frame(self.content_frame)
        btn_frame.pack(pady=20)

        dashboard_btn = ttk.Button(
            btn_frame,
            text="Open LogNog Dashboard",
            command=self._open_dashboard,
            width=20
        )
        dashboard_btn.pack(side=tk.LEFT, padx=5)

        close_btn = ttk.Button(
            btn_frame,
            text="Close",
            command=self._complete_wizard,
            width=12
        )
        close_btn.pack(side=tk.LEFT, padx=5)

    def _open_dashboard(self) -> None:
        """Open LogNog dashboard in browser."""
        url = self.data["server_url"].rstrip("/")
        if ":4000" in url:
            web_url = url.replace(":4000", "")
        else:
            web_url = url
        webbrowser.open(web_url)

    def _complete_wizard(self) -> None:
        """Complete wizard and close."""
        if self.window:
            self.window.destroy()
            self.window = None
        if self.on_complete:
            self.on_complete()

    def _next_step(self) -> None:
        """Go to next step."""
        if self.current_step < len(self.STEPS) - 1:
            self.current_step += 1
            self._render_step()

    def _prev_step(self) -> None:
        """Go to previous step."""
        if self.current_step > 0:
            self.current_step -= 1
            self._render_step()

    def _skip_wizard(self) -> None:
        """Skip the wizard."""
        self.config.set("_wizard_skipped", True)
        self.config.save()
        if self.window:
            self.window.destroy()
            self.window = None
        if self.on_skip:
            self.on_skip()
