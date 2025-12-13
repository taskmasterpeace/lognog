"""Tests for sound alerts module."""

import pytest
from pathlib import Path
from unittest.mock import Mock, patch
from lognog_in.sound_alerts import SoundAlertPlayer, SoundAlertManager, Severity
from lognog_in.config import Config


def test_severity_enum():
    """Test Severity enum values."""
    assert Severity.CRITICAL.value == "critical"
    assert Severity.ERROR.value == "error"
    assert Severity.WARNING.value == "warning"
    assert Severity.INFO.value == "info"


def test_sound_alert_player_init():
    """Test SoundAlertPlayer initialization."""
    player = SoundAlertPlayer()
    assert player._backend in ["winsound", "pygame", "none"]


def test_sound_alert_player_availability():
    """Test sound availability detection."""
    player = SoundAlertPlayer()
    # Should not crash
    is_available = player.is_available()
    assert isinstance(is_available, bool)


@patch("lognog_in.sound_alerts.threading.Thread")
def test_play_sound_none(mock_thread):
    """Test playing sound with None path (should do nothing)."""
    player = SoundAlertPlayer()
    player.play_sound(None, Severity.INFO, 100)
    # Should not start thread
    mock_thread.assert_not_called()


@patch("lognog_in.sound_alerts.threading.Thread")
def test_play_sound_default(mock_thread):
    """Test playing default beep sound."""
    player = SoundAlertPlayer()
    player.play_sound("default", Severity.CRITICAL, 100)
    # Should start background thread
    mock_thread.assert_called_once()


def test_sound_alert_manager_init():
    """Test SoundAlertManager initialization."""
    config = Config()
    config.sound_alerts_enabled = True
    config.sound_volume = 75

    manager = SoundAlertManager(config)
    assert manager.config == config
    assert manager._enabled is True
    assert manager.player is not None


def test_sound_alert_manager_disabled():
    """Test SoundAlertManager when disabled."""
    config = Config()
    config.sound_alerts_enabled = False

    manager = SoundAlertManager(config)
    assert manager._enabled is False

    # Playing alert should do nothing
    with patch.object(manager.player, 'play_sound') as mock_play:
        manager.play_alert("critical")
        mock_play.assert_not_called()


def test_sound_alert_manager_play_alert():
    """Test playing an alert through the manager."""
    config = Config()
    config.sound_alerts_enabled = True
    config.sound_critical = "default"
    config.sound_volume = 80

    manager = SoundAlertManager(config)

    with patch.object(manager.player, 'play_sound') as mock_play:
        manager.play_alert("critical")
        mock_play.assert_called_once_with("default", Severity.CRITICAL, 80)


def test_sound_alert_manager_get_sound_path():
    """Test getting sound paths for different severities."""
    config = Config()
    config.sound_critical = "/path/to/critical.wav"
    config.sound_error = "default"
    config.sound_warning = "/path/to/warning.wav"
    config.sound_info = "default"

    manager = SoundAlertManager(config)

    assert manager._get_sound_path(Severity.CRITICAL) == "/path/to/critical.wav"
    assert manager._get_sound_path(Severity.ERROR) == "default"
    assert manager._get_sound_path(Severity.WARNING) == "/path/to/warning.wav"
    assert manager._get_sound_path(Severity.INFO) == "default"


def test_sound_alert_manager_update_config():
    """Test updating manager configuration."""
    config1 = Config()
    config1.sound_alerts_enabled = False

    manager = SoundAlertManager(config1)
    assert manager._enabled is False

    config2 = Config()
    config2.sound_alerts_enabled = True

    manager.update_config(config2)
    assert manager._enabled is True
    assert manager.config == config2


def test_sound_alert_manager_invalid_severity():
    """Test handling of invalid severity."""
    config = Config()
    config.sound_alerts_enabled = True
    config.sound_info = "default"

    manager = SoundAlertManager(config)

    # Should fall back to INFO for invalid severity
    with patch.object(manager.player, 'play_sound') as mock_play:
        manager.play_alert("invalid_severity")
        # Should use INFO severity as fallback
        mock_play.assert_called_once()
        args = mock_play.call_args[0]
        assert args[1] == Severity.INFO
