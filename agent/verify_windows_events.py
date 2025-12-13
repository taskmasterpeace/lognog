#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verification script for Windows Event Log collection implementation."""

import sys
import io
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def verify_files():
    """Verify all required files exist."""
    print("Verifying Windows Event Log Collection Implementation...\n")

    required_files = [
        # Core implementation
        "src/lognog_in/collectors/__init__.py",
        "src/lognog_in/collectors/windows_events.py",

        # Tests
        "tests/test_windows_events.py",

        # Documentation
        "docs/WINDOWS-EVENTS.md",
        "config.example.yaml",
        "WINDOWS-EVENTS-IMPLEMENTATION.md",
    ]

    all_exist = True
    for file_path in required_files:
        full_path = Path(__file__).parent / file_path
        exists = full_path.exists()
        status = "✓" if exists else "✗"
        print(f"{status} {file_path}")
        if not exists:
            all_exist = False

    return all_exist


def verify_imports():
    """Verify imports work correctly."""
    print("\nVerifying imports...")

    try:
        from lognog_in.config import WindowsEventsConfig, Config
        print("✓ WindowsEventsConfig imported")

        # Test default config
        config = WindowsEventsConfig()
        assert config.enabled == False
        assert config.channels == ["Security", "System", "Application"]
        assert config.poll_interval == 10
        print("✓ WindowsEventsConfig defaults correct")

        # Test Config includes windows_events
        full_config = Config()
        assert hasattr(full_config, 'windows_events')
        assert isinstance(full_config.windows_events, WindowsEventsConfig)
        print("✓ Config includes windows_events")

    except Exception as e:
        print(f"✗ Import error: {e}")
        return False

    # Try importing collector (may fail on non-Windows or without pywin32)
    if sys.platform == "win32":
        try:
            from lognog_in.collectors.windows_events import WindowsEventCollector
            print("✓ WindowsEventCollector imported (pywin32 available)")
        except ImportError as e:
            print(f"⚠ WindowsEventCollector not available: {e}")
            print("  This is expected if pywin32 is not installed")
    else:
        print(f"⚠ Not on Windows (platform: {sys.platform}), skipping collector import")

    return True


def verify_config_serialization():
    """Verify config save/load works."""
    print("\nVerifying config serialization...")

    import tempfile
    import yaml
    from lognog_in.config import Config

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "test_config.yaml"

            # Create config
            config = Config(
                server_url="http://test:4000",
                api_key="test-key",
            )
            config.windows_events.enabled = True
            config.windows_events.channels = ["Security"]
            config.windows_events.event_ids = [4624, 4625]
            config.windows_events.poll_interval = 30

            # Save
            config.save(config_path)
            print("✓ Config saved")

            # Load
            loaded = Config.load(config_path)
            assert loaded.windows_events.enabled == True
            assert loaded.windows_events.channels == ["Security"]
            assert loaded.windows_events.event_ids == [4624, 4625]
            assert loaded.windows_events.poll_interval == 30
            print("✓ Config loaded correctly")

            # Check YAML format
            with open(config_path) as f:
                data = yaml.safe_load(f)
                assert "windows_events" in data
                assert data["windows_events"]["enabled"] == True
                print("✓ YAML format correct")

        return True
    except Exception as e:
        print(f"✗ Config serialization error: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_agent_integration():
    """Verify agent can be initialized."""
    print("\nVerifying agent integration...")

    try:
        from lognog_in.agent import Agent, HAS_WINDOWS_EVENTS

        print(f"✓ Agent imported (HAS_WINDOWS_EVENTS={HAS_WINDOWS_EVENTS})")

        # Create agent (don't start it)
        from lognog_in.config import Config
        config = Config()
        config.windows_events.enabled = True

        agent = Agent(config=config, headless=True)

        # Check if windows_events is properly initialized
        if sys.platform == "win32" and HAS_WINDOWS_EVENTS:
            assert agent.windows_events is not None
            print("✓ Agent windows_events collector initialized")
        else:
            print(f"⚠ windows_events collector not initialized (platform={sys.platform}, HAS_WINDOWS_EVENTS={HAS_WINDOWS_EVENTS})")

        return True
    except Exception as e:
        print(f"✗ Agent integration error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all verifications."""
    print("=" * 70)
    print("Windows Event Log Collection - Implementation Verification")
    print("=" * 70)
    print()

    results = []

    results.append(("File Structure", verify_files()))
    results.append(("Imports", verify_imports()))
    results.append(("Config Serialization", verify_config_serialization()))
    results.append(("Agent Integration", verify_agent_integration()))

    print("\n" + "=" * 70)
    print("Summary")
    print("=" * 70)

    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"{status:6} - {name}")

    all_passed = all(passed for _, passed in results)

    print("\n" + "=" * 70)
    if all_passed:
        print("✓ All verifications PASSED")
        print("\nImplementation is complete and working correctly!")
        return 0
    else:
        print("✗ Some verifications FAILED")
        print("\nPlease review the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
