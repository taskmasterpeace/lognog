"""Collectors package for LogNog In agent."""

import sys

__all__ = []

# Only export WindowsEventCollector on Windows
if sys.platform == "win32":
    try:
        from .windows_events import WindowsEventCollector
        __all__.append("WindowsEventCollector")
    except ImportError:
        # pywin32 not installed
        pass
