"""
LogNog Lite - Self-hosted Log Management Server

A standalone Windows application that runs the LogNog server
with SQLite storage. No Docker required.

By Machine King Labs
"""

import os
import sys
import subprocess
import threading
import webbrowser
import time
import signal
from pathlib import Path
from typing import Optional

# For system tray
try:
    import pystray
    from PIL import Image
    HAS_TRAY = True
except ImportError:
    HAS_TRAY = False

# For GUI dialogs
try:
    import tkinter as tk
    from tkinter import messagebox
    HAS_TK = True
except ImportError:
    HAS_TK = False


def get_base_path() -> Path:
    """Get the base path for bundled resources (inside EXE temp folder)."""
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        return Path(sys._MEIPASS)
    return Path(__file__).parent.parent


def get_exe_dir() -> Path:
    """Get the directory where the EXE lives (for external resources)."""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent


def get_data_dir() -> Path:
    """Get the data directory (next to the EXE or in current dir)."""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent / 'data'
    return Path.cwd() / 'data'


def get_node_path() -> Optional[str]:
    """Find Node.js executable."""
    # Check bundled Node.js first
    base = get_base_path()
    bundled_node = base / 'node' / 'node.exe'
    if bundled_node.exists():
        return str(bundled_node)

    # Check if Node.js is in PATH
    try:
        result = subprocess.run(
            ['node', '--version'],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        )
        if result.returncode == 0:
            return 'node'
    except FileNotFoundError:
        pass

    return None


class LogNogLiteServer:
    """Main server controller."""

    def __init__(self):
        self.base_path = get_base_path()
        self.data_dir = get_data_dir()
        self.process: Optional[subprocess.Popen] = None
        self.port = 4000
        self.running = False
        self.tray_icon = None

    def ensure_data_dir(self):
        """Create data directory if it doesn't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def get_api_path(self) -> Path:
        """Get path to API entry point."""
        exe_dir = get_exe_dir()

        # First, check next to the EXE (preferred for distribution)
        external_api = exe_dir / 'api' / 'dist' / 'index.js'
        if external_api.exists():
            return external_api

        # Check if bundled inside EXE (fallback)
        bundled_api = self.base_path / 'api' / 'dist' / 'index.js'
        if bundled_api.exists():
            return bundled_api

        # Development mode - look relative to lite folder
        dev_api = self.base_path.parent / 'api' / 'dist' / 'index.js'
        if dev_api.exists():
            return dev_api

        return external_api  # Return expected path for error message

    def start(self) -> bool:
        """Start the LogNog server."""
        node_path = get_node_path()
        if not node_path:
            self.show_error(
                "Node.js Not Found",
                "Node.js is required to run LogNog Lite.\n\n"
                "Please install Node.js from https://nodejs.org/"
            )
            return False

        api_path = self.get_api_path()
        if not api_path.exists():
            self.show_error(
                "API Not Found",
                f"Could not find the API at:\n{api_path}\n\n"
                "Please reinstall LogNog Lite."
            )
            return False

        self.ensure_data_dir()

        # Set up environment
        env = os.environ.copy()
        env['LOGNOG_BACKEND'] = 'sqlite'
        env['NODE_ENV'] = 'production'
        env['PORT'] = str(self.port)
        env['SQLITE_PATH'] = str(self.data_dir / 'lognog.db')
        env['LOGS_DB_PATH'] = str(self.data_dir / 'lognog-logs.db')

        # Start the server
        try:
            self.process = subprocess.Popen(
                [node_path, str(api_path)],
                env=env,
                cwd=str(api_path.parent.parent),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            self.running = True

            # Start output reader thread
            threading.Thread(target=self._read_output, daemon=True).start()

            return True
        except Exception as e:
            self.show_error("Failed to Start", f"Could not start server:\n{e}")
            return False

    def _read_output(self):
        """Read server output (for logging/debugging)."""
        if self.process and self.process.stdout:
            for line in self.process.stdout:
                print(line.decode('utf-8', errors='ignore').strip())

    def stop(self):
        """Stop the LogNog server."""
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
        self.running = False

    def open_dashboard(self):
        """Open the dashboard in the default browser."""
        webbrowser.open(f'http://localhost:{self.port}')

    def show_error(self, title: str, message: str):
        """Show an error dialog."""
        if HAS_TK:
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror(title, message)
            root.destroy()
        else:
            print(f"ERROR: {title}\n{message}")


class SystemTray:
    """System tray icon handler."""

    def __init__(self, server: LogNogLiteServer):
        self.server = server
        self.icon = None

    def create_icon(self) -> Optional[Image.Image]:
        """Load or create the tray icon."""
        # Try to load from assets
        icon_paths = [
            get_base_path() / 'assets' / 'lognog.ico',
            get_base_path() / 'assets' / 'lognog.png',
            get_base_path().parent / 'ui' / 'public' / 'favicon.ico',
        ]

        for icon_path in icon_paths:
            if icon_path.exists():
                try:
                    return Image.open(str(icon_path))
                except Exception:
                    pass

        # Create a simple default icon
        img = Image.new('RGB', (64, 64), color=(76, 175, 80))  # Green
        return img

    def create_menu(self):
        """Create the system tray menu."""
        return pystray.Menu(
            pystray.MenuItem(
                "Open Dashboard",
                lambda: self.server.open_dashboard(),
                default=True  # Double-click action
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Status: Running" if self.server.running else "Status: Stopped",
                None,
                enabled=False
            ),
            pystray.MenuItem(
                f"Port: {self.server.port}",
                None,
                enabled=False
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Exit",
                self.on_exit
            )
        )

    def on_exit(self):
        """Handle exit from tray menu."""
        self.server.stop()
        if self.icon:
            self.icon.stop()

    def run(self):
        """Run the system tray icon."""
        icon_image = self.create_icon()
        self.icon = pystray.Icon(
            "LogNog Lite",
            icon_image,
            "LogNog Lite",
            menu=self.create_menu()
        )
        self.icon.run()


def main():
    """Main entry point."""
    print("")
    print("========================================")
    print("   LogNog Lite")
    print("   Self-hosted Log Management")
    print("   By Machine King Labs")
    print("========================================")
    print("")

    server = LogNogLiteServer()

    # Start the server
    if not server.start():
        return 1

    print(f"Server starting on port {server.port}...")
    print(f"Data directory: {server.data_dir}")
    print("")

    # Wait a moment for server to start
    time.sleep(2)

    # Open dashboard on first run
    first_run_file = server.data_dir / '.first_run'
    if not first_run_file.exists():
        first_run_file.write_text(time.strftime('%Y-%m-%d %H:%M:%S'))
        server.open_dashboard()

    if HAS_TRAY:
        print("Running in system tray. Right-click the icon for options.")
        print("")
        tray = SystemTray(server)
        tray.run()
    else:
        print("Press Ctrl+C to stop the server.")
        print("")
        try:
            while server.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
            server.stop()

    return 0


if __name__ == '__main__':
    sys.exit(main())
