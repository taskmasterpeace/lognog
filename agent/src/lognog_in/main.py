"""Main entry point for LogNog In agent."""

import argparse
import logging
import sys
from pathlib import Path

from . import __version__
from .config import Config, WatchPath, FIMPath
from .agent import Agent

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
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

    return parser.parse_args()


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
        # Test health endpoint
        response = httpx.get(f"{config.server_url}/health", timeout=10.0)
        if response.status_code == 200:
            print("[OK] Server health check passed")
        else:
            print(f"[FAIL] Server returned: {response.status_code}")
            return 1

        # Test authentication
        response = httpx.get(
            f"{config.server_url}/api/auth/me",
            headers={"Authorization": f"ApiKey {config.api_key}"},
            timeout=10.0,
        )
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
    print()
    print(f"Watch paths: {len(config.watch_paths)}")
    for wp in config.watch_paths:
        status = "[+]" if wp.enabled else "[-]"
        print(f"  {status} {wp.path} ({wp.pattern})")
    print()
    print(f"FIM enabled: {'Yes' if config.fim_enabled else 'No'}")
    print(f"FIM paths: {len(config.fim_paths)}")
    for fp in config.fim_paths:
        status = "[+]" if fp.enabled else "[-]"
        print(f"  {status} {fp.path} ({fp.pattern})")

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
        "api_key": config.api_key[:20] + "..." if config.api_key else "",
        "hostname": config.hostname,
        "batch_size": config.batch_size,
        "batch_interval_seconds": config.batch_interval_seconds,
        "watch_paths": [
            {"path": wp.path, "pattern": wp.pattern, "enabled": wp.enabled}
            for wp in config.watch_paths
        ],
        "fim_enabled": config.fim_enabled,
        "fim_paths": [
            {"path": fp.path, "pattern": fp.pattern, "enabled": fp.enabled}
            for fp in config.fim_paths
        ],
    }

    print(yaml.dump(data, default_flow_style=False))
    return 0


def main() -> int:
    """Main entry point."""
    args = parse_args()

    # Handle subcommands
    if args.command == "init":
        return cmd_init(args)
    elif args.command == "test":
        return cmd_test(args)
    elif args.command == "status":
        return cmd_status(args)
    elif args.command == "config":
        return cmd_config(args)

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

    # Create and run agent
    agent = Agent(config=config, headless=args.headless)

    try:
        agent.start()
        agent.wait()
    except KeyboardInterrupt:
        pass
    finally:
        agent.stop()

    return 0


if __name__ == "__main__":
    sys.exit(main())
