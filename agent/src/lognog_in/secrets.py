"""At-rest protection for the API key.

On Windows the key is wrapped with DPAPI in *machine* scope
(``CRYPTPROTECT_LOCAL_MACHINE``) so that both the interactive tray app and the
LocalSystem service can read the same config file. The token is stored as
``dpapi:<base64>`` in ``config.yaml`` instead of the plaintext key.

Anywhere DPAPI is unavailable (Linux/macOS, pywin32 missing) the helpers return
``None`` and the config keeps the plaintext key with owner-only file
permissions.
"""

import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)

PREFIX = "dpapi:"
_DESCRIPTION = "LogNog In API key"
_CRYPTPROTECT_LOCAL_MACHINE = 0x4
_CRYPTPROTECT_UI_FORBIDDEN = 0x1

try:  # pragma: no cover - import guard
    import win32crypt  # type: ignore
    _HAS_DPAPI = True
except ImportError:  # pragma: no cover
    win32crypt = None
    _HAS_DPAPI = False


def is_available() -> bool:
    """True when DPAPI protection can be used on this machine."""
    return _HAS_DPAPI


def is_protected_token(value) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)


def protect_secret(plain: str) -> Optional[str]:
    """Return a ``dpapi:`` token for ``plain``, or None if DPAPI is unavailable."""
    if not _HAS_DPAPI or not plain:
        return None
    try:
        blob = win32crypt.CryptProtectData(
            plain.encode("utf-8"),
            _DESCRIPTION,
            None,
            None,
            None,
            _CRYPTPROTECT_LOCAL_MACHINE | _CRYPTPROTECT_UI_FORBIDDEN,
        )
        return PREFIX + base64.b64encode(blob).decode("ascii")
    except Exception as e:  # pragma: no cover - platform specific
        logger.warning(f"DPAPI protect failed; storing API key in plaintext: {e}")
        return None


def unprotect_secret(token: str) -> Optional[str]:
    """Decrypt a ``dpapi:`` token; None when it can't be read on this machine."""
    if not is_protected_token(token):
        return None
    if not _HAS_DPAPI:
        return None
    try:
        blob = base64.b64decode(token[len(PREFIX):])
        _desc, data = win32crypt.CryptUnprotectData(
            blob, None, None, None, _CRYPTPROTECT_UI_FORBIDDEN
        )
        return data.decode("utf-8")
    except Exception as e:  # pragma: no cover - platform specific
        logger.error(f"DPAPI unprotect failed: {e}")
        return None
