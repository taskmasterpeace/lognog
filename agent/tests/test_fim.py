"""Tests for File Integrity Monitoring module."""

import os
import tempfile
from pathlib import Path

import pytest

from lognog_in.config import Config, FIMPath
from lognog_in.buffer import FIMEvent
from lognog_in.fim import (
    compute_file_hash,
    get_file_metadata,
    BaselineDatabase,
    FileIntegrityMonitor,
)


class TestComputeFileHash:
    """Tests for compute_file_hash function."""

    def test_hash_file(self, tmp_path: Path):
        """Test computing hash of a file."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Hello, World!")

        hash_result = compute_file_hash(str(test_file))

        assert hash_result is not None
        assert hash_result.startswith("sha256:")
        # SHA-256 hash is 64 hex characters
        assert len(hash_result) == len("sha256:") + 64

    def test_hash_nonexistent_file(self):
        """Test hashing a nonexistent file."""
        result = compute_file_hash("/nonexistent/file/path")
        assert result is None

    def test_hash_changes_with_content(self, tmp_path: Path):
        """Test that hash changes when content changes."""
        test_file = tmp_path / "test.txt"

        test_file.write_text("Content 1")
        hash1 = compute_file_hash(str(test_file))

        test_file.write_text("Content 2")
        hash2 = compute_file_hash(str(test_file))

        assert hash1 != hash2

    def test_same_content_same_hash(self, tmp_path: Path):
        """Test that same content produces same hash."""
        file1 = tmp_path / "file1.txt"
        file2 = tmp_path / "file2.txt"

        content = "Same content"
        file1.write_text(content)
        file2.write_text(content)

        hash1 = compute_file_hash(str(file1))
        hash2 = compute_file_hash(str(file2))

        assert hash1 == hash2


class TestGetFileMetadata:
    """Tests for get_file_metadata function."""

    def test_get_metadata(self, tmp_path: Path):
        """Test getting file metadata."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Test content")

        metadata = get_file_metadata(str(test_file))

        assert "size" in metadata
        assert metadata["size"] == 12  # "Test content"
        assert "mode" in metadata
        assert "mtime" in metadata
        assert "ctime" in metadata

    def test_metadata_nonexistent_file(self):
        """Test getting metadata for nonexistent file."""
        metadata = get_file_metadata("/nonexistent/file")
        assert metadata == {}


class TestBaselineDatabase:
    """Tests for BaselineDatabase class."""

    def test_set_and_get_baseline(self, tmp_path: Path):
        """Test setting and getting a baseline."""
        db = BaselineDatabase(tmp_path / "baseline.db")

        db.set_baseline("/etc/test.conf", "sha256:abc123", {"size": 100})
        result = db.get_baseline("/etc/test.conf")

        assert result is not None
        hash_val, metadata = result
        assert hash_val == "sha256:abc123"
        assert metadata["size"] == 100

    def test_get_nonexistent_baseline(self, tmp_path: Path):
        """Test getting a nonexistent baseline."""
        db = BaselineDatabase(tmp_path / "baseline.db")
        result = db.get_baseline("/nonexistent")
        assert result is None

    def test_update_baseline(self, tmp_path: Path):
        """Test updating an existing baseline."""
        db = BaselineDatabase(tmp_path / "baseline.db")

        db.set_baseline("/etc/test.conf", "sha256:abc123", {"size": 100})
        db.set_baseline("/etc/test.conf", "sha256:def456", {"size": 200})

        result = db.get_baseline("/etc/test.conf")
        assert result is not None
        hash_val, metadata = result
        assert hash_val == "sha256:def456"
        assert metadata["size"] == 200

    def test_remove_baseline(self, tmp_path: Path):
        """Test removing a baseline."""
        db = BaselineDatabase(tmp_path / "baseline.db")

        db.set_baseline("/etc/test.conf", "sha256:abc123", {})
        db.remove_baseline("/etc/test.conf")

        result = db.get_baseline("/etc/test.conf")
        assert result is None

    def test_get_all_baselines(self, tmp_path: Path):
        """Test getting all baselines."""
        db = BaselineDatabase(tmp_path / "baseline.db")

        db.set_baseline("/etc/file1", "sha256:hash1", {"a": 1})
        db.set_baseline("/etc/file2", "sha256:hash2", {"b": 2})
        db.set_baseline("/etc/file3", "sha256:hash3", {"c": 3})

        baselines = db.get_all_baselines()

        assert len(baselines) == 3
        paths = [b[0] for b in baselines]
        assert "/etc/file1" in paths
        assert "/etc/file2" in paths
        assert "/etc/file3" in paths

    def test_clear(self, tmp_path: Path):
        """Test clearing all baselines."""
        db = BaselineDatabase(tmp_path / "baseline.db")

        db.set_baseline("/etc/file1", "sha256:hash1", {})
        db.set_baseline("/etc/file2", "sha256:hash2", {})

        db.clear()

        baselines = db.get_all_baselines()
        assert len(baselines) == 0

    def test_persistence(self, tmp_path: Path):
        """Test that baselines persist across instances."""
        db_path = tmp_path / "baseline.db"

        db1 = BaselineDatabase(db_path)
        db1.set_baseline("/etc/test.conf", "sha256:abc123", {"key": "value"})

        db2 = BaselineDatabase(db_path)
        result = db2.get_baseline("/etc/test.conf")

        assert result is not None
        assert result[0] == "sha256:abc123"


class TestFileIntegrityMonitor:
    """Tests for FileIntegrityMonitor class."""

    def test_build_baseline(self, tmp_path: Path):
        """Test building baseline for monitored files."""
        # Create test files
        monitored_dir = tmp_path / "monitored"
        monitored_dir.mkdir()
        (monitored_dir / "file1.txt").write_text("Content 1")
        (monitored_dir / "file2.txt").write_text("Content 2")
        (monitored_dir / "other.log").write_text("Log content")

        events = []

        config = Config(
            fim_enabled=True,
            fim_paths=[
                FIMPath(path=str(monitored_dir), pattern="*.txt", recursive=False),
            ],
        )

        # Override the data dir to use tmp_path
        original_get_data_dir = Config.get_data_dir
        Config.get_data_dir = staticmethod(lambda: tmp_path / "data")

        try:
            monitor = FileIntegrityMonitor(config, on_event=events.append)
            count = monitor.build_baseline()

            # Should baseline 2 .txt files
            assert count == 2
        finally:
            Config.get_data_dir = original_get_data_dir

    def test_is_running(self, tmp_path: Path):
        """Test is_running status."""
        config = Config(fim_enabled=False)

        original_get_data_dir = Config.get_data_dir
        Config.get_data_dir = staticmethod(lambda: tmp_path / "data")

        try:
            monitor = FileIntegrityMonitor(config, on_event=lambda e: None)

            assert monitor.is_running() is False
            monitor.start()  # Won't start because fim_enabled=False
            assert monitor.is_running() is False
        finally:
            Config.get_data_dir = original_get_data_dir

    def test_verify_baseline_detects_modification(self, tmp_path: Path):
        """Test that verify_baseline detects file modifications."""
        monitored_dir = tmp_path / "monitored"
        monitored_dir.mkdir()
        test_file = monitored_dir / "test.txt"
        test_file.write_text("Original content")

        events = []

        config = Config(
            hostname="testhost",
            fim_enabled=True,
            fim_paths=[
                FIMPath(path=str(monitored_dir), pattern="*.txt", recursive=False),
            ],
        )

        original_get_data_dir = Config.get_data_dir
        Config.get_data_dir = staticmethod(lambda: tmp_path / "data")

        try:
            monitor = FileIntegrityMonitor(config, on_event=events.append)
            monitor.build_baseline()

            # Modify the file
            test_file.write_text("Modified content")

            # Verify
            verification_events = monitor.verify_baseline()

            assert len(verification_events) == 1
            assert verification_events[0].event_type == "modified"
            assert verification_events[0].file_path == str(test_file)
        finally:
            Config.get_data_dir = original_get_data_dir

    def test_verify_baseline_detects_deletion(self, tmp_path: Path):
        """Test that verify_baseline detects file deletion."""
        monitored_dir = tmp_path / "monitored"
        monitored_dir.mkdir()
        test_file = monitored_dir / "test.txt"
        test_file.write_text("Content")

        config = Config(
            hostname="testhost",
            fim_enabled=True,
            fim_paths=[
                FIMPath(path=str(monitored_dir), pattern="*.txt", recursive=False),
            ],
        )

        original_get_data_dir = Config.get_data_dir
        Config.get_data_dir = staticmethod(lambda: tmp_path / "data")

        try:
            monitor = FileIntegrityMonitor(config, on_event=lambda e: None)
            monitor.build_baseline()

            # Delete the file
            test_file.unlink()

            # Verify
            verification_events = monitor.verify_baseline()

            assert len(verification_events) == 1
            assert verification_events[0].event_type == "deleted"
        finally:
            Config.get_data_dir = original_get_data_dir
