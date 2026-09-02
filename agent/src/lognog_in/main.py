"""Main entry point for LogNog In agent."""

import argparse
import logging
import sys
from pathlib import Path

from . import __version__
from .config import Config, WatchPath, FIMPath
from .agent import Agent

logger = logging.getLogger(__name__)

# Arguments / commands whose whole point is console output. The Windows EXE is
# built windowed (no console) so the tray app doesn't drag a black window
# around; for these we attach to the parent console so the text is visible.
_CONSOLE_COMMANDS = {"init", "test", "status", "config", "doctor", "send-test", "flush", "version"}
_CONSOLE_FLAGS = {"--help", "-h", "--version", "--service"}


def attach_parent_console() -> bool:
    """Attach a windowed Windows EXE to the console it was launched from.

    Returns True when stdout/stderr were redirected to the parent console.
    No-op outside frozen Windows builds or when there is no parent console
    (double-clicked from Explorer).
    """
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return False
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        ATTACH_PARENT_PROCESS = ctypes.c_uint32(-1).value
        if not kernel32.AttachConsole(ATTACH_PARENT_PROCESS):
            return False
        sys.stdout = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
        sys.stderr = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
        # The shell already printed its prompt; start on a fresh line.
        sys.stdout.write("\n")
        return True
    except Exception:
        return False


def wants_console(argv: list[str]) -> bool:
    """True when the invocation is a CLI action rather than the tray app."""
    return any(a in _CONSOLE_FLAGS for a in argv) or any(a in _CONSOLE_COMMANDS for a in argv)


def parse_args(argv=None) -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        prog="lognog-in",
        description="LogNog In - Lightweight log shipping agent",
    )

    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )

    parser.add_argument(
        "--config",
        type=Path,
        help="Path to config file",
    )

    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without system tray (daemon mode)",
    )

    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )

    # Server connection
    parser.add_argument(
        "--server",
        type=str,
        help="LogNog server URL",
    )

    parser.add_argument(
        "--api-key",
        type=str,
        help="API key for authentication",
    )

    # Quick setup
    parser.add_argument(
        "--watch",
        type=str,
        action="append",
        help="Path to watch for logs (can be repeated)",
    )

    parser.add_argument(
        "--fim",
        type=str,
        action="append",
        help="Path to monitor for file integrity (can be repeated)",
    )

    # Windows Service management. Running as a service (LocalSystem) is what
    # unlocks the Security event channel. Actions: install, uninstall, run,
    # start, stop, status.
    parser.add_argument(
        "--service",
        type=str,
        metavar="ACTION",
        choices=["install", "uninstall", "run", "start", "stop", "status"],
        help="Manage the Windows service (install|uninstall|run|start|stop|status)",
    )

    # Subcommands
    subparsers = parser.add_subparsers(dest="command")

    # Init config
    init_parser = subparsers.add_parser("init", help="Initialize configuration")
    init_parser.add_argument("--server", type=str, required=True, help="Server URL")
    init_parser.add_argument("--api-key", type=str, required=True, help="API key")

    # Test connection
    subparsers.add_parser("test", help="Test server connection")

    # Show status
    subparsers.add_parser("status", help="Show agent status")

    # Show config
    subparsers.add_parser("config", help="Show configuration")

    # Diagnostics
    subparsers.add_parser("doctor", help="Run diagnostics (config, buffer, channels, connectivity)")

    # Send a test event end-to-end
    send_parser = subparsers.add_parser("send-test", help="Send one test event to the server")
    send_parser.add_argument("--message", type=str, default=None, help="Custom message text")

    # Flush the offline buffer
    flush_parser = subparsers.add_parser("flush", help="Ship everything in the offline buffer now")
    flush_parser.add_argument("--timeout", type=float, default=60.0, help="Seconds to spend flushing")

    subparsers.add_parser("version", help="Show version")

    return parser.parse_args(argv)


def cmd_init(args: argparse.Namespace) -> int:
    """Initialize configuration."""
    config = Config(
        server_url=args.server,
        api_key=args.api_key,
    )
    config.save()
    print(f"Configuration saved to: {Config.get_config_path()}")
    return 0


def cmd_test(args: argparse.Namespace) -> int:
    """Test server connection."""
    import httpx

    config = Config.load(args.config)

    if not config.is_configured():
        print("Error: Agent not configured. Run 'lognog-in init' first.")
        return 1

    print(f"Testing connection to {config.server_url}...")

    try:
        verify = config.httpx_verify()
        # Test health endpoint
        response = httpx.get(f"{config.server_url}/health", timeout=10.0, verify=verify)
        if response.status_code == 200:
            print("[OK] Server health check passed")
            try:
                body = response.json()
                if isinstance(body, dict) and body.get("backend"):
                    print(f"     backend={body.get('backend')} store={body.get('services', {}).get('store', '?')}")
            except ValueError:
                pass
        else:
            print(f"[FAIL] Server returned: {response.status_code}")
            return 1

        # Test authentication. The agent always talks to the /api/... paths
        # (the LogNog web address); the bare API container serves the same
        # routes without the prefix, so a 404 here almost always means the
        # server_url points at port 4000 directly.
        headers = {"Authorization": f"ApiKey {config.api_key}"}
        response = httpx.get(f"{config.server_url}/api/auth/me", headers=headers, timeout=10.0, verify=verify)
        if response.status_code == 404:
            fallback = httpx.get(f"{config.server_url}/auth/me", headers=headers, timeout=10.0, verify=verify)
            if fallback.status_code != 404:
                print("[FAIL] server_url points at the bare API (no /api prefix). Log shipping would 404.")
                print("       Use the LogNog web address instead, e.g. https://logs.example.com")
                return 1
        if response.status_code == 200:
            user = response.json()
            print(f"[OK] Authenticated as: {user.get('username', 'unknown')}")
        elif response.status_code == 401:
            print("[FAIL] Authentication failed - check API key")
            return 1
        else:
            print(f"[FAIL] Auth check returned: {response.status_code}")
            return 1

        print("\nConnection test successful!")
        return 0

    except httpx.ConnectError as e:
        print(f"[FAIL] Connection failed: {e}")
        if "CERTIFICATE_VERIFY_FAILED" in str(e):
            print("       Self-signed certificate? Set ca_bundle: <path.pem> or verify_tls: false in the config.")
        return 1
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return 1


def cmd_status(args: argparse.Namespace) -> int:
    """Show agent status."""
    config = Config.load(args.config)

    print("LogNog In Agent Status")
    print("=" * 40)
    print(f"Version: {__version__}")
    print(f"Config: {Config.get_config_path()}")
    print(f"Data: {Config.get_data_dir()}")
    print(f"Logs: {Config.get_log_dir()}")
    print()
    print(f"Server: {config.server_url}")
    print(f"Configured: {'Yes' if config.is_configured() else 'No'}")
    print(f"Hostname: {config.hostname}")
    if config.tags:
        print(f"Tags: {', '.join(f'{k}={v}' for k, v in config.tags.items())}")
    if config.index:
        print(f"Default index: {config.index}")
    print()
    print(f"Watch paths: {len(config.watch_paths)}")
    for wp in config.watch_paths:
        status = "[+]" if wp.enabled else "[-]"
        extras = []
        if wp.exclude:
            extras.append(f"exclude {wp.exclude}")
        if wp.multiline_pattern:
            extras.append("multiline")
        if wp.index:
            extras.append(f"index={wp.index}")
        print(f"  {status} {wp.path} ({wp.pattern}){'  ' + ', '.join(extras) if extras else ''}")
    print()
    print(f"FIM enabled: {'Yes' if config.fim_enabled else 'No'}")
    print(f"FIM paths: {len(config.fim_paths)}")
    for fp in config.fim_paths:
        status = "[+]" if fp.enabled else "[-]"
        print(f"  {status} {fp.path} ({fp.pattern})")
    print()
    we = config.windows_events
    print(f"Windows Events: {'enabled' if we.enabled else 'disabled'} (api={we.api}, every {we.poll_interval}s)")
    if we.enabled:
        for ch in we.channels:
            print(f"  - {ch}")
        if we.event_ids:
            print(f"  include IDs: {we.event_ids}")
        if we.exclude_event_ids:
            print(f"  exclude IDs: {we.exclude_event_ids}")

    if sys.platform == "win32":
        from .service import service_status
        print()
        print(f"Windows service: {service_status()}")

    return 0


def cmd_config(args: argparse.Namespace) -> int:
    """Show configuration."""
    import yaml

    config = Config.load(args.config)
    config_path = args.config or Config.get_config_path()

    print(f"# Configuration from: {config_path}")
    print()

    # Create dict representation
    data = {
        "server_url": config.server_url,
        "api_key": config.api_key[:8] + "..." if config.api_key else "",
        "hostname": config.hostname,
        "batch_size": config.batch_size,
        "batch_interval_seconds": config.batch_interval_seconds,
        "tags": config.tags,
        "index": config.index,
        "verify_tls": config.verify_tls,
        "ca_bundle": config.ca_bundle,
        "compress_payloads": config.compress_payloads,
        "heartbeat_interval_seconds": config.heartbeat_interval_seconds,
        "scan_interval_seconds": config.scan_interval_seconds,
        "watch_paths": [wp.to_dict() for wp in config.watch_paths],
        "fim_enabled": config.fim_enabled,
        "fim_paths": [
            {"path": fp.path, "pattern": fp.pattern, "enabled": fp.enabled}
            for fp in config.fim_paths
        ],
        "windows_events": config.windows_events.to_dict(),
    }

    print(yaml.dump(data, default_flow_style=False, sort_keys=False))
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """Diagnostics: everything a support ticket would ask for, in one screen."""
    import os
    from .buffer import EventBuffer
    from .offset_store import FileOffsetStore
    from . import secrets

    config = Config.load(args.config)
    problems = 0

    def ok(label: str, detail: str = "") -> None:
        print(f"[OK]   {label}{': ' + detail if detail else ''}")

    def bad(label: str, detail: str = "") -> None:
        nonlocal problems
        problems += 1
        print(f"[FAIL] {label}{': ' + detail if detail else ''}")

    def warn(label: str, detail: str = "") -> None:
        print(f"[WARN] {label}{': ' + detail if detail else ''}")

    print(f"LogNog In {__version__} doctor")
    print("=" * 40)
    print(f"Python {sys.version.split()[0]} on {sys.platform}{' (frozen EXE)' if getattr(sys, 'frozen', False) else ''}")
    print(f"Config file: {Config.get_config_path()} ({'exists' if Config.get_config_path().exists() else 'missing'})")
    print(f"Data dir:    {Config.get_data_dir()}")
    print(f"Log dir:     {Config.get_log_dir()}")
    print()

    # Configuration
    if config.is_configured():
        ok("Server URL + API key configured", config.server_url)
    else:
        bad("Not configured", "run: lognog-in init --server URL --api-key KEY")
    if sys.platform == "win32":
        if secrets.is_available():
            ok("API key protection (DPAPI)", "available" + ("" if config.protect_api_key else " but disabled in config"))
        else:
            warn("API key protection (DPAPI)", "pywin32 missing; key stored in plaintext")
    if not config.verify_tls:
        warn("TLS verification disabled", "verify_tls: false")

    # Watch paths
    for wp in config.watch_paths:
        if not wp.enabled:
            continue
        root = wp.path
        if "*" in root:
            root = str(Path(root).parent)
        if os.path.exists(root):
            count = 0
            try:
                from .watcher import LogFileHandler
                handler = LogFileHandler(wp, config.hostname, lambda e: None, offset_store=FileOffsetStore())
                count = sum(1 for _ in handler.iter_files())
            except Exception:
                pass
            ok(f"Watch path {wp.path}", f"{count} file(s) match {wp.pattern}")
        else:
            bad(f"Watch path {wp.path}", "does not exist")

    # Buffer
    try:
        buffer = EventBuffer()
        count = buffer.count()
        size = buffer.total_bytes()
        (ok if count < config.buffer_max_rows * 0.8 else warn)(
            "Offline buffer", f"{count} event(s), {size / 1024:.1f} KB at {buffer.db_path}"
        )
    except Exception as e:
        bad("Offline buffer", str(e))

    # Windows Event channels
    if sys.platform == "win32" and config.windows_events.enabled:
        try:
            from .collectors.windows_events import WindowsEventCollector, HAS_MODERN_API
            print(f"Windows Event API: {'modern (EvtQuery)' if HAS_MODERN_API else 'legacy (ReadEventLog)'}")
            for ch in config.windows_events.channels:
                readable, detail = WindowsEventCollector.check_channel(ch)
                (ok if readable else bad)(f"Channel {ch}", detail)
        except ImportError as e:
            bad("Windows Event collection", f"pywin32 missing ({e})")

    # Service
    if sys.platform == "win32":
        from .service import service_status
        print(f"Windows service: {service_status()}")

    # Connectivity
    print()
    rc = cmd_test(args)
    if rc != 0:
        problems += 1

    print()
    print("No problems found." if problems == 0 else f"{problems} problem(s) found.")
    return 0 if problems == 0 else 1


def cmd_send_test(args: argparse.Namespace) -> int:
    """Queue one test event and flush it so the round trip is visible in LogNog."""
    from datetime import datetime, timezone
    from .buffer import EventBuffer, LogEvent
    from .shipper import HTTPShipper

    config = Config.load(args.config)
    if not config.is_configured():
        print("Error: Agent not configured. Run 'lognog-in init' first.")
        return 1

    buffer = EventBuffer(max_rows=config.buffer_max_rows, max_bytes=config.buffer_max_bytes)
    shipper = HTTPShipper(config=config, buffer=buffer)
    message = args.message or f"LogNog In test event from {config.hostname} at {datetime.now(timezone.utc).isoformat()}"
    shipper.queue_log_event(LogEvent(
        timestamp=datetime.now(timezone.utc).isoformat(),
        hostname=config.hostname,
        source="lognog-in",
        source_type="agent_test",
        file_path="",
        message=message,
        metadata={"severity": "info", "agent_version": __version__},
    ))
    before = buffer.count()
    sent = shipper.flush(timeout=20.0)
    if sent >= 1:
        print(f"[OK] Test event delivered (plus {sent - 1} buffered event(s)). Search LogNog for: source_type=agent_test")
        return 0
    print(f"[FAIL] Could not deliver ({before} event(s) remain buffered): {shipper.get_stats().get('last_error')}")
    return 1


def cmd_flush(args: argparse.Namespace) -> int:
    """Drain the offline buffer to the server."""
    from .buffer import EventBuffer
    from .shipper import HTTPShipper

    config = Config.load(args.config)
    buffer = EventBuffer(max_rows=config.buffer_max_rows, max_bytes=config.buffer_max_bytes)
    pending = buffer.count()
    if pending == 0:
        print("Buffer is empty.")
        return 0
    print(f"Flushing {pending} buffered event(s) to {config.server_url}...")
    shipper = HTTPShipper(config=config, buffer=buffer)
    sent = shipper.flush(timeout=args.timeout)
    remaining = buffer.count()
    print(f"Sent {sent}; {remaining} remaining." + (f" Last error: {shipper.get_stats().get('last_error')}" if remaining else ""))
    return 0 if remaining == 0 else 1


def main(argv=None) -> int:
    """Main entry point."""
    argv = list(sys.argv[1:] if argv is None else argv)
    if wants_console(argv):
        attach_parent_console()

    args = parse_args(argv)

    # Windows Service management takes precedence over everything else.
    if getattr(args, "service", None):
        if sys.platform != "win32":
            print("--service is only supported on Windows", file=sys.stderr)
            return 2
        from .service import dispatch_service_command
        return dispatch_service_command(args.service)

    # Handle subcommands
    if args.command == "init":
        return cmd_init(args)
    elif args.command == "test":
        return cmd_test(args)
    elif args.command == "status":
        return cmd_status(args)
    elif args.command == "config":
        return cmd_config(args)
    elif args.command == "doctor":
        return cmd_doctor(args)
    elif args.command == "send-test":
        return cmd_send_test(args)
    elif args.command == "flush":
        return cmd_flush(args)
    elif args.command == "version":
        print(f"lognog-in {__version__}")
        return 0

    # Load or create config
    config = Config.load(args.config)

    # Apply command line overrides
    if args.debug:
        config.debug_logging = True

    if args.server:
        config.server_url = args.server

    if args.api_key:
        config.api_key = args.api_key

    if args.watch:
        for path in args.watch:
            config.watch_paths.append(WatchPath(path=path))

    if args.fim:
        config.fim_enabled = True
        for path in args.fim:
            config.fim_paths.append(FIMPath(path=path))

    config.normalize()

    # Create and run agent
    agent = Agent(config=config, headless=args.headless)

    try:
        agent.start()
        agent.wait()
    except KeyboardInterrupt:
        pass
    except RuntimeError as e:
        # e.g. "Another instance is already running" - already reported.
        logger.error(str(e))
        return 1
    finally:
        agent.stop()

    return 0


if __name__ == "__main__":
    sys.exit(main())
