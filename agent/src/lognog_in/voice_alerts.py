"""Voice alert system for LogNog In agent.

Supports ElevenLabs text-to-speech with fallback to Windows SAPI TTS.
"""

import hashlib
import logging
import os
import subprocess
import tempfile
import threading
from enum import Enum
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


class VoiceProvider(Enum):
    """Voice provider options."""
    ELEVENLABS = "elevenlabs"
    WINDOWS_TTS = "windows_tts"


class ElevenLabsVoice:
    """Represents an ElevenLabs voice."""

    def __init__(self, voice_id: str, name: str, preview_url: Optional[str] = None):
        self.voice_id = voice_id
        self.name = name
        self.preview_url = preview_url


# Popular ElevenLabs voices for quick selection
DEFAULT_VOICES = [
    ElevenLabsVoice("21m00Tcm4TlvDq8ikWAM", "Rachel", None),
    ElevenLabsVoice("EXAVITQu4vr4xnSDHMvA", "Bella", None),
    ElevenLabsVoice("ErXwobaYiN019PkySvjV", "Antoni", None),
    ElevenLabsVoice("MF3mGyEYCl7XYWbV9V6O", "Elli", None),
    ElevenLabsVoice("TxGEqnHWrfWFTfGW9XjX", "Josh", None),
    ElevenLabsVoice("VR6AewLTigWG4xSOukaG", "Arnold", None),
    ElevenLabsVoice("pNInz6obpgDQGcFmaJgB", "Adam", None),
    ElevenLabsVoice("yoZ06aMxZJJ28mfd3POQ", "Sam", None),
]


class VoiceAlertManager:
    """
    Manages voice alerts with ElevenLabs or Windows TTS fallback.

    Features:
    - ElevenLabs API integration for high-quality voices
    - Windows SAPI TTS fallback when no API key
    - Audio caching to avoid re-generating
    - Async generation to not block main thread
    - Configurable voice selection
    """

    def __init__(
        self,
        cache_dir: Optional[Path] = None,
        elevenlabs_api_key: Optional[str] = None,
        elevenlabs_voice_id: Optional[str] = None,
        windows_voice_name: Optional[str] = None,
        enabled: bool = True,
    ):
        """
        Initialize the voice alert manager.

        Args:
            cache_dir: Directory to cache generated audio files
            elevenlabs_api_key: ElevenLabs API key (uses Windows TTS if None)
            elevenlabs_voice_id: ElevenLabs voice ID to use
            windows_voice_name: Windows SAPI voice name (None = default)
            enabled: Whether voice alerts are enabled
        """
        self.enabled = enabled
        self.elevenlabs_api_key = elevenlabs_api_key
        self.elevenlabs_voice_id = elevenlabs_voice_id or "21m00Tcm4TlvDq8ikWAM"  # Rachel
        self.windows_voice_name = windows_voice_name

        # Cache directory
        self.cache_dir = cache_dir or Path(tempfile.gettempdir()) / "lognog_voice_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Max cache size (100 files)
        self._max_cache_files = 100

        # Track active playback
        self._playing = False
        self._play_lock = threading.Lock()

        # Determine provider
        self._provider = (
            VoiceProvider.ELEVENLABS if elevenlabs_api_key
            else VoiceProvider.WINDOWS_TTS
        )

        logger.info(f"Voice alerts initialized: provider={self._provider.value}, enabled={enabled}")

    @property
    def provider(self) -> VoiceProvider:
        """Get the current voice provider."""
        return self._provider

    def set_elevenlabs_key(self, api_key: str) -> None:
        """Set/update the ElevenLabs API key."""
        self.elevenlabs_api_key = api_key
        if api_key:
            self._provider = VoiceProvider.ELEVENLABS
            logger.info("ElevenLabs API key configured")
        else:
            self._provider = VoiceProvider.WINDOWS_TTS
            logger.info("ElevenLabs API key removed, using Windows TTS")

    def set_voice(self, voice_id: str) -> None:
        """Set the ElevenLabs voice ID."""
        self.elevenlabs_voice_id = voice_id
        logger.info(f"ElevenLabs voice set to: {voice_id}")

    def speak_alert(
        self,
        title: str,
        message: str,
        severity: str = "medium",
        blocking: bool = False,
    ) -> None:
        """
        Speak an alert notification.

        Args:
            title: Alert title
            message: Alert message
            severity: Alert severity (for voice tone adjustments)
            blocking: If True, wait for speech to complete
        """
        if not self.enabled:
            return

        # Build the speech text
        severity_prefix = {
            "critical": "Critical alert.",
            "high": "High priority alert.",
            "medium": "Alert.",
            "low": "Notice.",
            "info": "Info.",
        }.get(severity.lower(), "Alert.")

        text = f"{severity_prefix} {title}. {message}"

        # Truncate very long messages
        if len(text) > 500:
            text = text[:497] + "..."

        if blocking:
            self._speak(text)
        else:
            threading.Thread(target=self._speak, args=(text,), daemon=True).start()

    def speak_text(self, text: str, blocking: bool = False) -> None:
        """Speak arbitrary text."""
        if not self.enabled:
            return

        if blocking:
            self._speak(text)
        else:
            threading.Thread(target=self._speak, args=(text,), daemon=True).start()

    def _speak(self, text: str) -> None:
        """Internal method to generate and play speech."""
        # Check if already playing (non-blocking check)
        with self._play_lock:
            if self._playing:
                logger.warning("Voice alert skipped: already playing another alert")
                return
            self._playing = True

        try:
            if self._provider == VoiceProvider.ELEVENLABS:
                self._speak_elevenlabs(text)
            else:
                self._speak_windows_tts(text)
        except Exception as e:
            logger.error(f"Voice alert error: {e}")
            # Try fallback to Windows TTS
            if self._provider == VoiceProvider.ELEVENLABS:
                logger.info("Falling back to Windows TTS")
                try:
                    self._speak_windows_tts(text)
                except Exception as e2:
                    logger.error(f"Windows TTS fallback also failed: {e2}")
        finally:
            with self._play_lock:
                self._playing = False

    def _speak_elevenlabs(self, text: str) -> None:
        """Generate and play speech using ElevenLabs API."""
        if not self.elevenlabs_api_key:
            raise ValueError("ElevenLabs API key not configured")

        # Check cache first (include model in cache key)
        model_id = "eleven_multilingual_v2"
        cache_key = self._get_cache_key(text, "elevenlabs", self.elevenlabs_voice_id, model_id)
        cache_file = self.cache_dir / f"{cache_key}.mp3"

        if cache_file.exists():
            logger.debug(f"Using cached audio: {cache_file}")
            self._play_audio_file(cache_file)
            return

        # Generate audio via ElevenLabs API
        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed, cannot use ElevenLabs API")
            raise

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.elevenlabs_voice_id}"
        headers = {
            "xi-api-key": self.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }
        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            }
        }

        with httpx.Client(timeout=30) as client:
            response = client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                error_msg = response.text[:200] if response.text else "Unknown error"
                raise Exception(f"ElevenLabs API error {response.status_code}: {error_msg}")

            # Save to cache
            cache_file.write_bytes(response.content)
            logger.debug(f"Cached audio: {cache_file}")

            # Clean old cache files
            self._clean_cache()

        # Play the audio
        self._play_audio_file(cache_file)

    def _speak_windows_tts(self, text: str) -> None:
        """Generate and play speech using Windows SAPI TTS."""
        import sys
        if sys.platform != "win32":
            logger.warning("Windows TTS only available on Windows")
            return

        # Use PowerShell to invoke SAPI
        voice_param = ""
        if self.windows_voice_name:
            # Escape voice name for PowerShell
            safe_voice = self.windows_voice_name.replace('"', '`"')
            voice_param = f'$speaker.SelectVoice("{safe_voice}"); '

        # Escape text for PowerShell double-quoted string
        # Order matters: backticks first, then other special chars
        escaped_text = text.replace('`', '``')  # Backticks
        escaped_text = escaped_text.replace('"', '`"')  # Double quotes
        escaped_text = escaped_text.replace('$', '`$')  # Dollar signs (variables)
        escaped_text = escaped_text.replace('\n', ' ')  # Newlines to spaces
        escaped_text = escaped_text.replace('\r', '')   # Remove carriage returns

        script = f'''
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
{voice_param}$speaker.Rate = 1
$speaker.Speak("{escaped_text}")
'''

        try:
            result = subprocess.run(
                ["powershell", "-Command", script],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                logger.error(f"Windows TTS error: {result.stderr}")
        except subprocess.TimeoutExpired:
            logger.error("Windows TTS timed out")
        except Exception as e:
            logger.error(f"Windows TTS error: {e}")

    def _play_audio_file(self, audio_file: Path) -> None:
        """Play an audio file."""
        import sys

        if sys.platform == "win32":
            # Use PowerShell MediaPlayer (more reliable than playsound library)
            try:
                # Escape path for PowerShell (handle spaces, special chars)
                safe_path = str(audio_file).replace('`', '``').replace('"', '`"').replace('$', '`$')
                # Script with error handling for duration detection
                script = f'''
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open("{safe_path}")
Start-Sleep -Milliseconds 500
$player.Play()
$maxWait = 60
$waited = 0
while ($player.NaturalDuration.HasTimeSpan -eq $false -and $waited -lt $maxWait) {{
    Start-Sleep -Milliseconds 100
    $waited += 0.1
}}
if ($player.NaturalDuration.HasTimeSpan) {{
    Start-Sleep -Seconds ([math]::Ceiling($player.NaturalDuration.TimeSpan.TotalSeconds) + 0.5)
}} else {{
    Start-Sleep -Seconds 10
}}
$player.Close()
'''
                result = subprocess.run(
                    ["powershell", "-Command", script],
                    capture_output=True,
                    timeout=120,
                )
                if result.returncode != 0:
                    logger.error(f"PowerShell audio playback error: {result.stderr}")
            except subprocess.TimeoutExpired:
                logger.error("Audio playback timed out")
            except Exception as e:
                logger.error(f"Failed to play audio: {e}")
        else:
            # Try common Linux audio players
            for player in ["mpv", "ffplay", "aplay"]:
                try:
                    subprocess.run([player, str(audio_file)], capture_output=True, timeout=60)
                    return
                except FileNotFoundError:
                    continue
            logger.warning("No audio player found")

    def _get_cache_key(self, text: str, provider: str, voice: str, model: str = "") -> str:
        """Generate a cache key for the given text and settings."""
        content = f"{provider}:{voice}:{model}:{text}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def _clean_cache(self) -> None:
        """Remove old cache files if over limit."""
        try:
            files = list(self.cache_dir.glob("*.mp3"))
            if len(files) > self._max_cache_files:
                # Sort by modification time, oldest first
                files.sort(key=lambda f: f.stat().st_mtime)
                # Remove oldest half
                for f in files[:len(files) // 2]:
                    try:
                        f.unlink()
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"Cache cleanup error: {e}")

    def get_available_voices(self) -> List[ElevenLabsVoice]:
        """Get available ElevenLabs voices (requires API key)."""
        if not self.elevenlabs_api_key:
            return DEFAULT_VOICES

        try:
            import httpx

            url = "https://api.elevenlabs.io/v1/voices"
            headers = {"xi-api-key": self.elevenlabs_api_key}

            with httpx.Client(timeout=30) as client:
                response = client.get(url, headers=headers)

                if response.status_code != 200:
                    logger.warning(f"Failed to fetch voices: {response.status_code}")
                    return DEFAULT_VOICES

                data = response.json()
                voices = []
                for v in data.get("voices", []):
                    voices.append(ElevenLabsVoice(
                        voice_id=v.get("voice_id", ""),
                        name=v.get("name", "Unknown"),
                        preview_url=v.get("preview_url"),
                    ))

                return voices if voices else DEFAULT_VOICES
        except Exception as e:
            logger.error(f"Error fetching voices: {e}")
            return DEFAULT_VOICES

    def get_windows_voices(self) -> List[str]:
        """Get available Windows SAPI voices."""
        import sys
        if sys.platform != "win32":
            return []

        try:
            script = '''
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
'''
            result = subprocess.run(
                ["powershell", "-Command", script],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                voices = [v.strip() for v in result.stdout.strip().split("\n") if v.strip()]
                return voices
        except Exception as e:
            logger.error(f"Error getting Windows voices: {e}")

        return []

    def test_voice(self) -> None:
        """Test the current voice configuration."""
        test_text = "This is a test of the LogNog voice alert system."
        self.speak_text(test_text, blocking=True)
