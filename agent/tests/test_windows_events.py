"""Tests for Windows Event Log collector."""

import sys
import pytest
from pathlib import Path

# Only run these tests on Windows
pytestmark = pytest.mark.skipif(
    sys.platform != "win32",
    reason="Windows Event tests only run on Windows"
)


class TestWindowsEventCollector:
    """Tests for WindowsEventCollector."""

    def test_import_collector(self):
        """Test that the collector can be imported on Windows."""
        try:
            from lognog_in.collectors.windows_events import WindowsEventCollector
            assert WindowsEventCollector is not None
        except ImportError as e:
            pytest.skip(f"pywin32 not available: {e}")

    def test_collector_initialization(self):
        """Test collector initialization."""
        try:
            from lognog_in.collectors.windows_events import WindowsEventCollector
        except ImportError:
            pytest.skip("pywin32 not available")

        collector = WindowsEventCollector(
            channels=["Application"],
            hostname="test-host",
            event_ids=[1000, 1001],
            poll_interval=30,
        )

        assert collector.channels == ["Application"]
        assert collector.hostname == "test-host"
        assert collector.event_ids == {1000, 1001}
        assert collector.poll_interval == 30
        assert not collector.is_running()

    def test_collector_stats(self):
        """Test collector statistics."""
        try:
            from lognog_in.collectors.windows_events import WindowsEventCollector
        except ImportError:
            pytest.skip("pywin32 not available")

        collector = WindowsEventCollector(
            channels=["Application", "System"],
            hostname="test-host",
            event_ids=[1000],
        )

        stats = collector.get_stats()
        assert stats["running"] is False
        assert stats["channels"] == ["Application", "System"]
        assert stats["event_ids_filter"] == [1000]
        assert stats["events_collected"] == 0
        assert stats["events_filtered"] == 0

    def test_bookmark_database(self):
        """Test bookmark persistence."""
        try:
            from lognog_in.collectors.windows_events import EventBookmark
        except ImportError:
            pytest.skip("pywin32 not available")

        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test_bookmarks.db"
            bookmarks = EventBookmark(db_path)

            # Set and get bookmark
            bookmarks.set_bookmark("Security", 12345)
            assert bookmarks.get_bookmark("Security") == 12345

            # Get non-existent bookmark
            assert bookmarks.get_bookmark("NonExistent") is None

            # Update bookmark
            bookmarks.set_bookmark("Security", 67890)
            assert bookmarks.get_bookmark("Security") == 67890


class TestWindowsEventsConfig:
    """Tests for Windows Events configuration."""

    def test_config_defaults(self):
        """Test default configuration values."""
        from lognog_in.config import WindowsEventsConfig

        config = WindowsEventsConfig()
        assert config.enabled is False
        assert config.channels == ["Security", "System", "Application"]
        assert config.event_ids is None
        assert config.poll_interval == 10

    def test_config_with_values(self):
        """Test configuration with custom values."""
        from lognog_in.config import WindowsEventsConfig

        config = WindowsEventsConfig(
            enabled=True,
            channels=["Security"],
            event_ids=[4624, 4625],
            poll_interval=5,
        )
        assert config.enabled is True
        assert config.channels == ["Security"]
        assert config.event_ids == [4624, 4625]
        assert config.poll_interval == 5

    def test_config_save_load(self):
        """Test saving and loading configuration with Windows Events."""
        from lognog_in.config import Config
        import tempfile
        import yaml

        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config.yaml"

            # Create config with Windows Events
            config = Config(
                server_url="http://test:4000",
                api_key="test-key",
            )
            config.windows_events.enabled = True
            config.windows_events.channels = ["Security", "System"]
            config.windows_events.event_ids = [4624, 4625, 4688]
            config.windows_events.poll_interval = 15

            # Save
            config.save(config_path)
            assert config_path.exists()

            # Load
            loaded_config = Config.load(config_path)
            assert loaded_config.windows_events.enabled is True
            assert loaded_config.windows_events.channels == ["Security", "System"]
            assert loaded_config.windows_events.event_ids == [4624, 4625, 4688]
            assert loaded_config.windows_events.poll_interval == 15

            # Check YAML format
            with open(config_path) as f:
                data = yaml.safe_load(f)
                assert "windows_events" in data
                assert data["windows_events"]["enabled"] is True
