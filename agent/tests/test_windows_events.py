"""Tests for Windows Event Log collector."""

import sys
import pytest
from pathlib import Path

# detect_record_reset is a pure function with no pywin32 dependency, so it can
# be tested on any platform.
from lognog_in.collectors.windows_events import detect_record_reset


class TestDetectRecordReset:
    """Tests for record-number reset detection (issue #42, log clear/wrap)."""

    def test_no_bookmark_returns_none(self):
        assert detect_record_reset(None, oldest=1, total=10) is None

    def test_empty_log_returns_bookmark_unchanged(self):
        assert detect_record_reset(500, oldest=0, total=0) == 500

    def test_normal_growth_keeps_bookmark(self):
        # Records 1..1000 present, bookmark at 900 -> newest 1000 >= 900, no reset.
        assert detect_record_reset(900, oldest=1, total=1000) == 900

    def test_reset_after_clear_resets_bookmark(self):
        # Log was cleared: only records 1..5 remain, but bookmark is 900.
        # newest = 5 < 900 -> reset to just before the new oldest (0).
        assert detect_record_reset(900, oldest=1, total=5) == 0

    def test_reset_with_nonzero_oldest(self):
        # New oldest record is 3 after a wrap; bookmark 900 is stale.
        # newest = 3 + 2 - 1 = 4 < 900 -> reset to oldest - 1 = 2.
        assert detect_record_reset(900, oldest=3, total=2) == 2

    def test_bookmark_at_newest_no_reset(self):
        # newest exactly equals bookmark -> not a reset.
        assert detect_record_reset(1000, oldest=1, total=1000) == 1000


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
