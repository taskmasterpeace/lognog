"""Sound alert system for LogNog In agent."""

import logging
import os
import sys
import threading
from enum import Enum
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class Severity(Enum):
    """Alert severity levels."""
    CRITICAL = "critical"
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class SoundAlertPlayer:
    """
    Cross-platform sound alert player.

    Supports:
    - Windows: winsound (built-in)
    - Cross-platform: pygame (optional fallback)
    - .wav file playback
    - Default system beeps
    - Volume control (when supported)
    """

    def __init__(self):
        self._backend = self._detect_backend()
        self._play_lock = threading.Lock()
        logger.info(f"Sound alerts initialized with backend: {self._backend}")

    def _detect_backend(self) -> str:
        """Detect available audio backend."""
        if sys.platform == "win32":
            try:
                import winsound
                return "winsound"
            except ImportError:
                pass

        try:
            import pygame.mixer
            pygame.mixer.init()
            return "pygame"
        except ImportError:
            pass

        logger.warning("No audio backend available - sound alerts will be disabled")
        return "none"

    def play_sound(self, sound_path: Optional[str] = None, severity: Severity = Severity.INFO, volume: int = 100) -> None:
        """
        Play a sound alert.

        Args:
            sound_path: Path to .wav file, or "default" for system beep, or None to skip
            severity: Alert severity level (used for default beep frequency)
            volume: Volume level 0-100 (only supported on some backends)
        """
        if not sound_path:
            return

        # Don't block - play in background thread
        threading.Thread(
            target=self._play_sound_sync,
            args=(sound_path, severity, volume),
            daemon=True,
        ).start()

    def _play_sound_sync(self, sound_path: str, severity: Severity, volume: int) -> None:
        """Synchronous sound playback."""
        with self._play_lock:
            try:
                if sound_path == "default":
                    self._play_default_beep(severity)
                else:
                    self._play_wav_file(sound_path, volume)
            except Exception as e:
                logger.debug(f"Failed to play sound: {e}")

    def _play_default_beep(self, severity: Severity) -> None:
        """Play a default system beep based on severity."""
        if self._backend == "winsound":
            import winsound

            # Map severity to frequency and duration
            beep_config = {
                Severity.CRITICAL: (1000, 500),  # High pitch, long
                Severity.ERROR: (800, 300),      # High pitch, medium
                Severity.WARNING: (600, 200),    # Medium pitch, short
                Severity.INFO: (400, 150),       # Low pitch, short
            }

            frequency, duration = beep_config.get(severity, (500, 200))
            winsound.Beep(frequency, duration)

        elif self._backend == "pygame":
            # Generate simple tone with pygame
            import pygame.sndarray
            import numpy as np

            # Map severity to frequency
            freq_map = {
                Severity.CRITICAL: 1000,
                Severity.ERROR: 800,
                Severity.WARNING: 600,
                Severity.INFO: 400,
            }

            frequency = freq_map.get(severity, 500)
            duration = 0.2  # seconds
            sample_rate = 22050

            # Generate sine wave
            samples = int(duration * sample_rate)
            wave = np.sin(2 * np.pi * frequency * np.linspace(0, duration, samples))
            wave = (wave * 32767).astype(np.int16)

            # Create stereo sound
            stereo = np.column_stack((wave, wave))
            sound = pygame.sndarray.make_sound(stereo)
            sound.play()

        else:
            # Fallback: try system bell
            try:
                print("\a", end="", flush=True)
            except Exception:
                pass

    def _play_wav_file(self, file_path: str, volume: int = 100) -> None:
        """Play a .wav file."""
        path = Path(file_path)
        if not path.exists():
            logger.warning(f"Sound file not found: {file_path}")
            return

        if not path.suffix.lower() == ".wav":
            logger.warning(f"Only .wav files are supported: {file_path}")
            return

        if self._backend == "winsound":
            import winsound
            # Note: winsound doesn't support volume control
            winsound.PlaySound(str(path), winsound.SND_FILENAME | winsound.SND_ASYNC)

        elif self._backend == "pygame":
            import pygame.mixer

            # Load and play sound
            sound = pygame.mixer.Sound(str(path))

            # Set volume (0.0 to 1.0)
            sound.set_volume(volume / 100.0)
            sound.play()

        else:
            logger.debug("No audio backend available for .wav playback")

    def test_sound(self, sound_path: Optional[str] = None, severity: Severity = Severity.INFO, volume: int = 100) -> bool:
        """
        Test a sound alert (synchronous).

        Returns:
            True if sound played successfully, False otherwise
        """
        if not sound_path:
            return False

        try:
            if sound_path == "default":
                self._play_default_beep(severity)
            else:
                self._play_wav_file(sound_path, volume)
            return True
        except Exception as e:
            logger.error(f"Sound test failed: {e}")
            return False

    def is_available(self) -> bool:
        """Check if sound playback is available."""
        return self._backend != "none"


class SoundAlertManager:
    """
    Manages sound alerts for different severity levels.

    Integrates with agent configuration to play appropriate sounds
    when notifications are received from the server.
    """

    def __init__(self, config: 'Config'):
        """
        Initialize the sound alert manager.

        Args:
            config: Agent configuration with sound settings
        """
        self.config = config
        self.player = SoundAlertPlayer()

        # Cache whether sounds are enabled
        self._enabled = getattr(config, 'sound_alerts_enabled', False)

    def play_alert(self, severity: str) -> None:
        """
        Play an alert sound for the given severity.

        Args:
            severity: Severity level (critical, error, warning, info)
        """
        if not self._enabled or not self.player.is_available():
            return

        # Map string severity to enum
        try:
            sev = Severity(severity.lower())
        except ValueError:
            sev = Severity.INFO

        # Get sound path from config
        sound_path = self._get_sound_path(sev)
        volume = getattr(self.config, 'sound_volume', 100)

        # Play the sound
        self.player.play_sound(sound_path, sev, volume)

    def _get_sound_path(self, severity: Severity) -> Optional[str]:
        """Get the configured sound path for a severity level."""
        attr_map = {
            Severity.CRITICAL: 'sound_critical',
            Severity.ERROR: 'sound_error',
            Severity.WARNING: 'sound_warning',
            Severity.INFO: 'sound_info',
        }

        attr_name = attr_map.get(severity)
        if not attr_name:
            return None

        return getattr(self.config, attr_name, "default")

    def test_severity_sound(self, severity: Severity) -> bool:
        """
        Test the sound for a specific severity level.

        Args:
            severity: Severity level to test

        Returns:
            True if sound played successfully
        """
        sound_path = self._get_sound_path(severity)
        volume = getattr(self.config, 'sound_volume', 100)
        return self.player.test_sound(sound_path, severity, volume)

    def update_config(self, config: 'Config') -> None:
        """Update the configuration."""
        self.config = config
        self._enabled = getattr(config, 'sound_alerts_enabled', False)

    def is_available(self) -> bool:
        """Check if sound alerts are available."""
        return self.player.is_available()
