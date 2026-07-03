"""Windows Service integration for the LogNog In agent.

Two shutdown-safety guarantees are provided here regardless of whether the full
Windows Service Control Manager (SCM) integration is available:

1. Graceful stop flushes the buffer. Whether stopped by the SCM, a console
   Ctrl-C/Ctrl-Break, or SIGTERM, the agent runs ``Agent.stop()`` which flushes
   buffered events to the server before exiting (see ``shipper.stop``).

2. Auto-restart on failure. When installed as a service via ``install_service``
   we configure the SCM failure-actions (equivalent to
   ``sc failure ... reset= 86400 actions= restart/5000/...``) so a crash
   restarts the agent automatically. Running as ``LocalSystem`` (the default
   for a service) is what unlocks the Security event channel.

If pywin32's service framework is unavailable (e.g. non-Windows dev box, or
pywin32 not installed), the module still exposes ``install_service`` /
``uninstall_service`` helpers that shell out to ``sc.exe`` so the service can be
managed, and ``run_service_console`` which runs the agent in the foreground with
graceful console-control shutdown.
"""

import logging
import signal
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

SERVICE_NAME = "LogNogIn"
SERVICE_DISPLAY_NAME = "LogNog In Log Shipping Agent"
SERVICE_DESCRIPTION = (
    "Ships logs, file-integrity events, and Windows Event Logs to a LogNog "
    "server. Runs as LocalSystem to access the Security event channel."
)

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
    HAS_SERVICE_FRAMEWORK = True
except ImportError:
    HAS_SERVICE_FRAMEWORK = False


def _configure_failure_actions() -> None:
    """Configure SCM auto-restart on failure via sc.exe (best-effort)."""
    try:
        subprocess.run(
            [
                "sc.exe", "failure", SERVICE_NAME,
                "reset=", "86400",
                # Restart after 5s on the 1st, 2nd, and subsequent failures.
                "actions=", "restart/5000/restart/5000/restart/10000",
            ],
            check=False,
            capture_output=True,
        )
    except Exception as e:
        logger.warning(f"Could not set service failure actions: {e}")


if HAS_SERVICE_FRAMEWORK:

    class LogNogService(win32serviceutil.ServiceFramework):
        """Windows Service wrapper that runs the LogNog In agent."""

        _svc_name_ = SERVICE_NAME
        _svc_display_name_ = SERVICE_DISPLAY_NAME
        _svc_description_ = SERVICE_DESCRIPTION

        def __init__(self, args):
            super().__init__(args)
            self._stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._agent = None

        def SvcStop(self):
            """SCM stop request: flush the buffer and shut the agent down."""
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            try:
                if self._agent is not None:
                    # Agent.stop() flushes the buffer via shipper.stop().
                    self._agent.stop()
            finally:
                win32event.SetEvent(self._stop_event)

        def SvcDoRun(self):
            """SCM start: run the agent headless until stopped."""
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            # Import here so the service host has the package on sys.path.
            from .config import Config
            from .agent import Agent

            config = Config.load()
            self._agent = Agent(config=config, headless=True)
            try:
                self._agent.start()
                # Block until SvcStop signals the event.
                win32event.WaitForSingleObject(self._stop_event, win32event.INFINITE)
            except Exception as e:
                servicemanager.LogErrorMsg(f"LogNog In service error: {e}")
                raise
            finally:
                if self._agent is not None:
                    self._agent.stop()


def install_service(python_exe: Optional[str] = None) -> int:
    """Install the agent as an auto-start Windows service.

    Uses pywin32's installer when available (registers the ServiceFramework
    class), otherwise falls back to ``sc.exe create``. Either way, failure
    actions are configured so the SCM auto-restarts on crash.
    """
    if HAS_SERVICE_FRAMEWORK:
        # Register via pywin32; start type = auto.
        win32serviceutil.InstallService(
            f"{LogNogService.__module__}.LogNogService",
            SERVICE_NAME,
            SERVICE_DISPLAY_NAME,
            startType=win32service.SERVICE_AUTO_START,
            description=SERVICE_DESCRIPTION,
        )
        _configure_failure_actions()
        print(f"Installed service '{SERVICE_NAME}' (auto-start, LocalSystem).")
        return 0

    # Fallback: sc.exe. Run the module in service mode.
    exe = python_exe or sys.executable
    bin_path = f'"{exe}" -m lognog_in --service run'
    result = subprocess.run(
        [
            "sc.exe", "create", SERVICE_NAME,
            "binPath=", bin_path,
            "start=", "auto",
            "DisplayName=", SERVICE_DISPLAY_NAME,
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"Failed to create service: {result.stdout}{result.stderr}", file=sys.stderr)
        return 1
    _configure_failure_actions()
    print(f"Installed service '{SERVICE_NAME}' via sc.exe (auto-start).")
    return 0


def uninstall_service() -> int:
    """Remove the Windows service."""
    if HAS_SERVICE_FRAMEWORK:
        try:
            win32serviceutil.StopService(SERVICE_NAME)
        except Exception:
            pass
        win32serviceutil.RemoveService(SERVICE_NAME)
        print(f"Removed service '{SERVICE_NAME}'.")
        return 0

    subprocess.run(["sc.exe", "stop", SERVICE_NAME], capture_output=True)
    result = subprocess.run(["sc.exe", "delete", SERVICE_NAME], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to delete service: {result.stdout}{result.stderr}", file=sys.stderr)
        return 1
    print(f"Removed service '{SERVICE_NAME}'.")
    return 0


def run_service_console() -> int:
    """Run the agent in the foreground with graceful shutdown.

    Used as the sc.exe fallback service entry point and for testing service
    behavior interactively. Installs SIGTERM / SIGBREAK / SIGINT handlers that
    stop the agent (flushing the buffer) before exiting.
    """
    from .config import Config
    from .agent import Agent

    config = Config.load()
    agent = Agent(config=config, headless=True)

    def _shutdown(signum, frame):  # noqa: ANN001
        logger.info(f"Received signal {signum}; shutting down service")
        agent.stop()

    for sig_name in ("SIGTERM", "SIGINT", "SIGBREAK"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            try:
                signal.signal(sig, _shutdown)
            except (ValueError, OSError):
                pass

    try:
        agent.start()
        agent.wait()
    finally:
        agent.stop()
    return 0


def dispatch_service_command(action: str) -> int:
    """Handle ``lognog-in --service <action>``.

    Actions: install, uninstall, run, start, stop.
    """
    action = (action or "").lower()
    if action == "install":
        return install_service()
    if action in ("uninstall", "remove"):
        return uninstall_service()
    if action == "run":
        # If launched by the SCM under the ServiceFramework, hand off; otherwise
        # run in the console with graceful shutdown.
        if HAS_SERVICE_FRAMEWORK and len(sys.argv) == 1:
            servicemanager.Initialize()
            servicemanager.PrepareToHostSingle(LogNogService)
            servicemanager.StartServiceCtrlDispatcher()
            return 0
        return run_service_console()
    if action == "start" and HAS_SERVICE_FRAMEWORK:
        win32serviceutil.StartService(SERVICE_NAME)
        return 0
    if action == "stop" and HAS_SERVICE_FRAMEWORK:
        win32serviceutil.StopService(SERVICE_NAME)
        return 0

    print(f"Unknown or unsupported service action: {action}", file=sys.stderr)
    print("Supported: install, uninstall, run, start, stop", file=sys.stderr)
    return 2
