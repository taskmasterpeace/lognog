"""The tray module must import on a machine with no desktop.

On Linux without $DISPLAY, pystray raises Xlib.error.DisplayNameError (not
ImportError) while it is being imported. That used to crash the whole agent at
import time, even in --headless mode.
"""

import builtins
import importlib

from lognog_in import tray


def test_tray_import_survives_a_backend_that_fails_to_start(monkeypatch):
    real_import = builtins.__import__

    def failing_import(name, *args, **kwargs):
        if name == "pystray":
            raise RuntimeError('Bad display name ""')
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", failing_import)
    try:
        reloaded = importlib.reload(tray)
        assert reloaded.TRAY_AVAILABLE is False
        # The real reason is kept for the log, not a generic "not installed".
        assert reloaded.TRAY_IMPORT_ERROR == 'RuntimeError: Bad display name ""'
        assert reloaded.create_icon_image(reloaded.ConnectionStatus.CONNECTED) is None
    finally:
        monkeypatch.setattr(builtins, "__import__", real_import)
        importlib.reload(tray)


def test_tray_import_error_is_none_when_tray_loads():
    if tray.TRAY_AVAILABLE:
        assert tray.TRAY_IMPORT_ERROR is None
