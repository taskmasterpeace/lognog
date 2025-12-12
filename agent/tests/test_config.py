"""Tests for configuration module."""

import tempfile
from pathlib import Path

import pytest

from lognog_in.config import Config, WatchPath, FIMPath


class TestConfig:
    """Tests for Config class."""

    def test_default_config(self):
        """Test default configuration values."""
        config = Config()

        assert config.server_url == "http://localhost:4000"
        assert config.api_key == ""
        assert config.batch_size == 100
        assert config.batch_interval_seconds == 5.0
        assert config.fim_enabled is False
        assert config.debug_logging is False

    def test_is_configured(self):
        """Test is_configured check."""
        config = Config()
        assert config.is_configured() is False

        config.server_url = "http://example.com"
        assert config.is_configured() is False

        config.api_key = "test-key"
        assert config.is_configured() is True

    def test_save_and_load(self, tmp_path: Path):
        """Test saving and loading configuration."""
        config_path = tmp_path / "config.yaml"

        # Create config
        config = Config(
            server_url="https://lognog.local",
            api_key="lnog_test_key_12345",
            watch_paths=[
                WatchPath(path="/var/log", pattern="*.log", recursive=True),
                WatchPath(path="/home/user/app", pattern="app.log", enabled=False),
            ],
            fim_enabled=True,
            fim_paths=[
                FIMPath(path="/etc", pattern="*"),
            ],
            batch_size=50,
            debug_logging=True,
        )

        # Save
        config.save(config_path)
        assert config_path.exists()

        # Load
        loaded = Config.load(config_path)

        assert loaded.server_url == "https://lognog.local"
        assert loaded.api_key == "lnog_test_key_12345"
        assert len(loaded.watch_paths) == 2
        assert loaded.watch_paths[0].path == "/var/log"
        assert loaded.watch_paths[0].pattern == "*.log"
        assert loaded.watch_paths[1].enabled is False
        assert loaded.fim_enabled is True
        assert len(loaded.fim_paths) == 1
        assert loaded.batch_size == 50
        assert loaded.debug_logging is True

    def test_load_nonexistent(self, tmp_path: Path):
        """Test loading from nonexistent file returns defaults."""
        config_path = tmp_path / "nonexistent.yaml"
        config = Config.load(config_path)

        assert config.server_url == "http://localhost:4000"
        assert config.api_key == ""


class TestWatchPath:
    """Tests for WatchPath."""

    def test_defaults(self):
        """Test default values."""
        wp = WatchPath(path="/var/log")

        assert wp.path == "/var/log"
        assert wp.pattern == "*"
        assert wp.recursive is True
        assert wp.enabled is True

    def test_custom_values(self):
        """Test custom values."""
        wp = WatchPath(
            path="/home/app",
            pattern="*.log",
            recursive=False,
            enabled=False,
        )

        assert wp.path == "/home/app"
        assert wp.pattern == "*.log"
        assert wp.recursive is False
        assert wp.enabled is False


class TestFIMPath:
    """Tests for FIMPath."""

    def test_defaults(self):
        """Test default values."""
        fp = FIMPath(path="/etc")

        assert fp.path == "/etc"
        assert fp.pattern == "*"
        assert fp.recursive is True
        assert fp.enabled is True
