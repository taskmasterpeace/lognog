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

Frozen (PyInstaller) builds are first-class: ``LogNogIn.exe --service install``
registers the EXE itself as the service binary (``LogNogIn.exe --service run``),
and ``--service run`` first tries to hand the process to the SCM dispatcher; if
the SCM isn't the parent (error 1063) it falls back to a console run with
graceful signal handling.

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
SERVICE_RUN_ARGS = "--service run"

# The SCM reports this when a process that calls StartServiceCtrlDispatcher was
# started from a console rather than by the service controller.
ERROR_FAILED_SERVICE_CONTROLLER_CONNECT = 1063

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
    import pywintypes
    HAS_SERVICE_FRAMEWORK = True
except ImportError:
    HAS_SERVICE_FRAMEWORK = False


def is_frozen() -> bool:
    """True when running from a PyInstaller bundle."""
    return bool(getattr(sys, "frozen", False))


def service_binary() -> tuple[str, str]:
    """(exe, args) the SCM should launch for this install."""
    if is_frozen():
        return sys.executable, SERVICE_RUN_ARGS
    return sys.executable, f"-m lognog_in {SERVICE_RUN_ARGS}"


def is_console_launch_error(err: BaseException) -> bool:
    """True when ``StartServiceCtrlDispatcher`` failed because we're not under the SCM."""
    return getattr(err, "winerror", None) == ERROR_FAILED_SERVICE_CONTROLLER_CONNECT


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
        # Frozen builds host the service in the EXE itself.
        if is_frozen():
            _exe_name_ = sys.executable
            _exe_args_ = SERVICE_RUN_ARGS

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
    class, or the frozen EXE itself), otherwise falls back to ``sc.exe create``.
    Either way, failure actions are configured so the SCM auto-restarts on crash.
    """
    if HAS_SERVICE_FRAMEWORK:
        kwargs = {}
        if is_frozen():
            exe, args = service_binary()
            kwargs = {"exeName": exe, "exeArgs": args}
        try:
            win32serviceutil.InstallService(
                f"{LogNogService.__module__}.LogNogService",
                SERVICE_NAME,
                SERVICE_DISPLAY_NAME,
                startType=win32service.SERVICE_AUTO_START,
                description=SERVICE_DESCRIPTION,
                **kwargs,
            )
        except pywintypes.error as e:
            if getattr(e, "winerror", None) == 5:
                print("Access denied: run this from an elevated (Administrator) prompt.", file=sys.stderr)
                return 1
            if getattr(e, "winerror", None) == 1073:
                print(f"Service '{SERVICE_NAME}' already exists. Use --service uninstall first.", file=sys.stderr)
                return 1
            raise
        _configure_failure_actions()
        print(f"Installed service '{SERVICE_NAME}' (auto-start, LocalSystem).")
        print("Start it with:  lognog-in --service start   (or: sc start LogNogIn)")
        return 0

    # Fallback: sc.exe. Run the module in service mode.
    exe, args = service_binary()
    if python_exe:
        exe = python_exe
    bin_path = f'"{exe}" {args}'
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
        try:
            win32serviceutil.RemoveService(SERVICE_NAME)
        except pywintypes.error as e:
            if getattr(e, "winerror", None) == 1060:
                print(f"Service '{SERVICE_NAME}' is not installed.", file=sys.stderr)
                return 1
            if getattr(e, "winerror", None) == 5:
                print("Access denied: run this from an elevated (Administrator) prompt.", file=sys.stderr)
                return 1
            raise
        print(f"Removed service '{SERVICE_NAME}'.")
        return 0

    subprocess.run(["sc.exe", "stop", SERVICE_NAME], capture_output=True)
    result = subprocess.run(["sc.exe", "delete", SERVICE_NAME], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to delete service: {result.stdout}{result.stderr}", file=sys.stderr)
        return 1
    print(f"Removed service '{SERVICE_NAME}'.")
    return 0


def service_status() -> str:
    """Human-readable SCM state of the service ('not installed', 'running', ...)."""
    if HAS_SERVICE_FRAMEWORK:
        try:
            state = win32serviceutil.QueryServiceStatus(SERVICE_NAME)[1]
        except pywintypes.error as e:
            if getattr(e, "winerror", None) == 1060:
                return "not installed"
            return f"unknown ({e.strerror})"
        return {
            win32service.SERVICE_STOPPED: "stopped",
            win32service.SERVICE_START_PENDING: "starting",
            win32service.SERVICE_STOP_PENDING: "stopping",
            win32service.SERVICE_RUNNING: "running",
            win32service.SERVICE_CONTINUE_PENDING: "resuming",
            win32service.SERVICE_PAUSE_PENDING: "pausing",
            win32service.SERVICE_PAUSED: "paused",
        }.get(state, f"state {state}")
    if sys.platform != "win32":
        return "n/a (not Windows)"
    result = subprocess.run(["sc.exe", "query", SERVICE_NAME], capture_output=True, text=True)
    if result.returncode != 0:
        return "not installed"
    for line in result.stdout.splitlines():
        if "STATE" in line:
            return line.split(":", 1)[1].strip().split(" ", 1)[-1].strip().lower()
    return "unknown"


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


def run_service() -> int:
    """Entry point for ``--service run``.

    Hands the process to the SCM dispatcher when the SCM launched us; when run
    from a console (error 1063) falls back to the foreground runner.
    """
    if HAS_SERVICE_FRAMEWORK:
        try:
            servicemanager.Initialize()
            servicemanager.PrepareToHostSingle(LogNogService)
            servicemanager.StartServiceCtrlDispatcher()
            return 0
        except pywintypes.error as e:
            if not is_console_launch_error(e):
                raise
            logger.info("Not started by the SCM; running in the console instead")
    return run_service_console()


def dispatch_service_command(action: str) -> int:
    """Handle ``lognog-in --service <action>``.

    Actions: install, uninstall, run, start, stop, status.
    """
    action = (action or "").lower()
    if action == "install":
        return install_service()
    if action in ("uninstall", "remove"):
        return uninstall_service()
    if action == "run":
        return run_service()
    if action == "status":
        print(f"Service '{SERVICE_NAME}': {service_status()}")
        return 0
    if action in ("start", "stop"):
        if HAS_SERVICE_FRAMEWORK:
            try:
                if action == "start":
                    win32serviceutil.StartService(SERVICE_NAME)
                else:
                    win32serviceutil.StopService(SERVICE_NAME)
            except pywintypes.error as e:
                print(f"Failed to {action} service: {e.strerror}", file=sys.stderr)
                return 1
            print(f"Service '{SERVICE_NAME}' {action} requested; state: {service_status()}")
            return 0
        result = subprocess.run(["sc.exe", action, SERVICE_NAME], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Failed to {action} service: {result.stdout}{result.stderr}", file=sys.stderr)
            return 1
        print(f"Service '{SERVICE_NAME}' {action} requested.")
        return 0

    print(f"Unknown or unsupported service action: {action}", file=sys.stderr)
    print("Supported: install, uninstall, run, start, stop, status", file=sys.stderr)
    return 2
