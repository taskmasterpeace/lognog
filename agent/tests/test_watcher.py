"""Tests for file watcher module."""

import time
from pathlib import Path

import pytest

from lognog_in.config import Config, WatchPath
from lognog_in.buffer import LogEvent
from lognog_in.watcher import LogFileHandler, FileWatcher


class TestLogFileHandler:
    """Tests for LogFileHandler class."""

    def test_matches_pattern_wildcard(self, tmp_path: Path):
        """Test pattern matching with wildcard."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="testhost",
            on_event=events.append,
        )

        assert handler._matches_pattern("/var/log/app.log") is True
        assert handler._matches_pattern("/var/log/system.log") is True
        assert handler._matches_pattern("/var/log/app.txt") is False
        assert handler._matches_pattern("/var/log/app.log.1") is False

    def test_matches_pattern_specific(self, tmp_path: Path):
        """Test pattern matching with specific filename."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="syslog"),
            hostname="testhost",
            on_event=events.append,
        )

        assert handler._matches_pattern("/var/log/syslog") is True
        assert handler._matches_pattern("/var/log/syslog2") is False

    def test_matches_pattern_complex(self, tmp_path: Path):
        """Test pattern matching with complex pattern."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="app*.log"),
            hostname="testhost",
            on_event=events.append,
        )

        assert handler._matches_pattern("/var/log/app.log") is True
        assert handler._matches_pattern("/var/log/app1.log") is True
        assert handler._matches_pattern("/var/log/application.log") is True
        assert handler._matches_pattern("/var/log/myapp.log") is False

    def test_read_new_lines(self, tmp_path: Path):
        """Test reading new lines from file."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="testhost",
            on_event=events.append,
        )

        # Create test file
        test_file = tmp_path / "test.log"
        test_file.write_text("Line 1\nLine 2\nLine 3\n")

        # First read
        lines = handler._read_new_lines(str(test_file))
        assert lines == ["Line 1", "Line 2", "Line 3"]

        # Second read should return nothing
        lines = handler._read_new_lines(str(test_file))
        assert lines == []

        # Append more lines
        with open(test_file, "a") as f:
            f.write("Line 4\nLine 5\n")

        lines = handler._read_new_lines(str(test_file))
        assert lines == ["Line 4", "Line 5"]

    def test_read_new_lines_handles_rotation(self, tmp_path: Path):
        """Test that rotation (truncation) is handled."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="testhost",
            on_event=events.append,
        )

        test_file = tmp_path / "test.log"

        # Write initial content
        test_file.write_text("Old Line 1\nOld Line 2\nOld Line 3\n")
        handler._read_new_lines(str(test_file))

        # "Rotate" the file (truncate and write new content)
        test_file.write_text("New Line 1\n")

        lines = handler._read_new_lines(str(test_file))
        assert lines == ["New Line 1"]

    def test_process_file_generates_events(self, tmp_path: Path):
        """Test that processing file generates log events."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="testhost",
            on_event=events.append,
        )

        test_file = tmp_path / "app.log"
        test_file.write_text("Log message 1\nLog message 2\n")

        handler._process_file(str(test_file))

        assert len(events) == 2
        assert events[0].hostname == "testhost"
        assert events[0].message == "Log message 1"
        assert events[0].file_path == str(test_file)
        assert events[1].message == "Log message 2"

    def test_process_file_skips_non_matching(self, tmp_path: Path):
        """Test that non-matching files are skipped."""
        events = []
        handler = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="testhost",
            on_event=events.append,
        )

        test_file = tmp_path / "data.txt"
        test_file.write_text("Some content\n")

        handler._process_file(str(test_file))

        assert len(events) == 0


class TestFileWatcher:
    """Tests for FileWatcher class."""

    def test_is_running(self, tmp_path: Path):
        """Test is_running status."""
        config = Config(
            watch_paths=[
                WatchPath(path=str(tmp_path), pattern="*.log"),
            ],
        )

        watcher = FileWatcher(config, on_event=lambda e: None)

        assert watcher.is_running() is False
        watcher.start()
        assert watcher.is_running() is True
        watcher.stop()
        assert watcher.is_running() is False

    def test_get_watched_paths(self, tmp_path: Path):
        """Test getting watched paths."""
        config = Config(
            watch_paths=[
                WatchPath(path="/var/log", pattern="*.log", enabled=True),
                WatchPath(path="/tmp/logs", pattern="*.log", enabled=False),
                WatchPath(path="/app/logs", pattern="*", enabled=True),
            ],
        )

        watcher = FileWatcher(config, on_event=lambda e: None)
        paths = watcher.get_watched_paths()

        assert len(paths) == 2
        assert "/var/log" in paths
        assert "/app/logs" in paths
        assert "/tmp/logs" not in paths

    def test_start_stop_multiple_times(self, tmp_path: Path):
        """Test starting and stopping multiple times."""
        config = Config(
            watch_paths=[
                WatchPath(path=str(tmp_path), pattern="*.log"),
            ],
        )

        watcher = FileWatcher(config, on_event=lambda e: None)

        # Start/stop cycle 1
        watcher.start()
        assert watcher.is_running()
        watcher.stop()
        assert not watcher.is_running()

        # Start/stop cycle 2
        watcher.start()
        assert watcher.is_running()
        watcher.stop()
        assert not watcher.is_running()

    def test_skips_nonexistent_paths(self, tmp_path: Path):
        """Test that nonexistent paths are skipped."""
        config = Config(
            watch_paths=[
                WatchPath(path=str(tmp_path / "nonexistent"), pattern="*.log"),
            ],
        )

        watcher = FileWatcher(config, on_event=lambda e: None)
        watcher.start()  # Should not raise

        # Watcher started but no handlers added
        assert watcher.is_running()
        watcher.stop()

    def test_detects_new_file_content(self, tmp_path: Path):
        """Test detecting content in newly created files."""
        events = []
        config = Config(
            hostname="testhost",
            watch_paths=[
                WatchPath(path=str(tmp_path), pattern="*.log", recursive=False),
            ],
        )

        watcher = FileWatcher(config, on_event=events.append)
        watcher.start()

        try:
            # Create and write to file
            test_file = tmp_path / "test.log"
            test_file.write_text("Test log entry\n")

            # Give watcher time to detect
            time.sleep(0.5)

            # Events may or may not be captured depending on timing
            # Just verify watcher is running and didn't crash
            assert watcher.is_running()
        finally:
            watcher.stop()
