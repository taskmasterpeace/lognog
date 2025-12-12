"""Tests for event buffer module."""

import json
from datetime import datetime
from pathlib import Path

import pytest

from lognog_in.buffer import EventBuffer, LogEvent, FIMEvent


class TestLogEvent:
    """Tests for LogEvent dataclass."""

    def test_to_dict(self):
        """Test converting to dictionary."""
        event = LogEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="app.log",
            source_type="file",
            file_path="/var/log/app.log",
            message="Test log message",
            metadata={"key": "value"},
        )

        result = event.to_dict()

        assert result["timestamp"] == "2024-01-15T10:30:00Z"
        assert result["hostname"] == "testhost"
        assert result["source"] == "app.log"
        assert result["message"] == "Test log message"
        assert result["metadata"] == {"key": "value"}

    def test_from_dict(self):
        """Test creating from dictionary."""
        data = {
            "timestamp": "2024-01-15T10:30:00Z",
            "hostname": "testhost",
            "source": "app.log",
            "source_type": "file",
            "file_path": "/var/log/app.log",
            "message": "Test log message",
            "metadata": {},
        }

        event = LogEvent.from_dict(data)

        assert event.timestamp == "2024-01-15T10:30:00Z"
        assert event.hostname == "testhost"
        assert event.message == "Test log message"


class TestFIMEvent:
    """Tests for FIMEvent dataclass."""

    def test_to_dict(self):
        """Test converting to dictionary."""
        event = FIMEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="lognog-in",
            source_type="fim",
            event_type="modified",
            file_path="/etc/passwd",
            previous_hash="sha256:abc123",
            current_hash="sha256:def456",
            file_owner="root",
            file_permissions="0o644",
            metadata={},
        )

        result = event.to_dict()

        assert result["event_type"] == "modified"
        assert result["file_path"] == "/etc/passwd"
        assert result["previous_hash"] == "sha256:abc123"
        assert result["current_hash"] == "sha256:def456"

    def test_from_dict_with_none(self):
        """Test creating from dictionary with None values."""
        data = {
            "timestamp": "2024-01-15T10:30:00Z",
            "hostname": "testhost",
            "source": "lognog-in",
            "source_type": "fim",
            "event_type": "deleted",
            "file_path": "/etc/passwd",
            "previous_hash": "sha256:abc123",
            "current_hash": None,
            "file_owner": None,
            "file_permissions": None,
            "metadata": {},
        }

        event = FIMEvent.from_dict(data)

        assert event.event_type == "deleted"
        assert event.current_hash is None
        assert event.file_owner is None


class TestEventBuffer:
    """Tests for EventBuffer class."""

    def test_add_and_count(self, tmp_path: Path):
        """Test adding events and counting."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        assert buffer.count() == 0

        event = LogEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="app.log",
            source_type="file",
            file_path="/var/log/app.log",
            message="Test message",
            metadata={},
        )

        event_id = buffer.add_log_event(event)
        assert event_id > 0
        assert buffer.count() == 1

    def test_add_multiple_events(self, tmp_path: Path):
        """Test adding multiple events."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        for i in range(5):
            event = LogEvent(
                timestamp=f"2024-01-15T10:30:0{i}Z",
                hostname="testhost",
                source="app.log",
                source_type="file",
                file_path="/var/log/app.log",
                message=f"Message {i}",
                metadata={},
            )
            buffer.add_log_event(event)

        assert buffer.count() == 5

    def test_add_fim_event(self, tmp_path: Path):
        """Test adding FIM event."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        event = FIMEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="lognog-in",
            source_type="fim",
            event_type="created",
            file_path="/etc/test.conf",
            previous_hash=None,
            current_hash="sha256:abc123",
            file_owner="root",
            file_permissions="0o644",
            metadata={},
        )

        event_id = buffer.add_fim_event(event)
        assert event_id > 0
        assert buffer.count() == 1

    def test_get_batch(self, tmp_path: Path):
        """Test getting a batch of events."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        # Add events
        for i in range(10):
            event = LogEvent(
                timestamp=f"2024-01-15T10:30:0{i}Z",
                hostname="testhost",
                source="app.log",
                source_type="file",
                file_path="/var/log/app.log",
                message=f"Message {i}",
                metadata={},
            )
            buffer.add_log_event(event)

        # Get batch of 5
        batch = buffer.get_batch(batch_size=5)

        assert len(batch) == 5
        # Should be ordered by created_at
        assert batch[0][2]["message"] == "Message 0"
        assert batch[4][2]["message"] == "Message 4"

    def test_remove_events(self, tmp_path: Path):
        """Test removing events."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        # Add events
        ids = []
        for i in range(5):
            event = LogEvent(
                timestamp=f"2024-01-15T10:30:0{i}Z",
                hostname="testhost",
                source="app.log",
                source_type="file",
                file_path="/var/log/app.log",
                message=f"Message {i}",
                metadata={},
            )
            ids.append(buffer.add_log_event(event))

        assert buffer.count() == 5

        # Remove first 3
        buffer.remove_events(ids[:3])
        assert buffer.count() == 2

    def test_remove_empty_list(self, tmp_path: Path):
        """Test removing empty list doesn't error."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        buffer.remove_events([])  # Should not raise

    def test_increment_attempts(self, tmp_path: Path):
        """Test incrementing attempt counter."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        event = LogEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="app.log",
            source_type="file",
            file_path="/var/log/app.log",
            message="Test",
            metadata={},
        )
        event_id = buffer.add_log_event(event)

        buffer.increment_attempts([event_id])
        buffer.increment_attempts([event_id])

        # Events still there
        assert buffer.count() == 1

    def test_remove_stale_events(self, tmp_path: Path):
        """Test removing stale events."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        event = LogEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="app.log",
            source_type="file",
            file_path="/var/log/app.log",
            message="Test",
            metadata={},
        )
        event_id = buffer.add_log_event(event)

        # Increment attempts 10 times
        for _ in range(10):
            buffer.increment_attempts([event_id])

        assert buffer.count() == 1

        # Remove stale (max_attempts=10)
        removed = buffer.remove_stale_events(max_attempts=10)
        assert removed == 1
        assert buffer.count() == 0

    def test_clear(self, tmp_path: Path):
        """Test clearing all events."""
        db_path = tmp_path / "buffer.db"
        buffer = EventBuffer(db_path)

        # Add events
        for i in range(5):
            event = LogEvent(
                timestamp=f"2024-01-15T10:30:0{i}Z",
                hostname="testhost",
                source="app.log",
                source_type="file",
                file_path="/var/log/app.log",
                message=f"Message {i}",
                metadata={},
            )
            buffer.add_log_event(event)

        assert buffer.count() == 5

        buffer.clear()
        assert buffer.count() == 0

    def test_persistence(self, tmp_path: Path):
        """Test that events persist across buffer instances."""
        db_path = tmp_path / "buffer.db"

        # Create buffer and add event
        buffer1 = EventBuffer(db_path)
        event = LogEvent(
            timestamp="2024-01-15T10:30:00Z",
            hostname="testhost",
            source="app.log",
            source_type="file",
            file_path="/var/log/app.log",
            message="Persistent message",
            metadata={},
        )
        buffer1.add_log_event(event)

        # Create new buffer instance
        buffer2 = EventBuffer(db_path)
        assert buffer2.count() == 1

        batch = buffer2.get_batch(1)
        assert batch[0][2]["message"] == "Persistent message"
