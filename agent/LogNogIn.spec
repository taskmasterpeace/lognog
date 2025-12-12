# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for LogNog In agent.

This creates a standalone Windows EXE with:
- System tray icon support (windowed mode, no console)
- Embedded icon file
- All dependencies bundled
- Single file executable
- Machine King Labs branding
"""

import sys
from pathlib import Path

# Paths
agent_root = Path(SPECPATH)
src_dir = agent_root / 'src'
assets_dir = agent_root / 'assets'
icon_file = assets_dir / 'lognog.ico'

# Ensure icon exists
if not icon_file.exists():
    print(f"Warning: Icon file not found at {icon_file}")
    icon_file = None
else:
    icon_file = str(icon_file)

block_cipher = None

a = Analysis(
    ['run_agent.py'],  # Use the entry point script
    pathex=[str(src_dir), str(agent_root)],
    binaries=[],
    datas=[
        # Include the icon in the assets directory
        (str(assets_dir / 'lognog.ico'), 'assets'),
    ],
    hiddenimports=[
        # Ensure all modules are included
        'lognog_in',
        'lognog_in.agent',
        'lognog_in.buffer',
        'lognog_in.config',
        'lognog_in.fim',
        'lognog_in.gui',
        'lognog_in.shipper',
        'lognog_in.tray',
        'lognog_in.watcher',
        'lognog_in.main',
        # Tkinter for GUI
        'tkinter',
        'tkinter.ttk',
        'tkinter.messagebox',
        'tkinter.filedialog',
        'tkinter.simpledialog',
        # System tray dependencies
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL._tkinter_finder',
        # HTTP client
        'httpx',
        'httpx._transports',
        'httpx._transports.default',
        'httpcore',
        'h11',
        'certifi',
        'idna',
        'sniffio',
        'anyio',
        # File monitoring
        'watchdog',
        'watchdog.observers',
        'watchdog.observers.winapi',
        'watchdog.events',
        # Configuration
        'yaml',
        'appdirs',
        # SQLite
        'sqlite3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude test modules
        'pytest',
        'pytest-asyncio',
        'pytest-cov',
        # Exclude dev tools
        'ruff',
        'mypy',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='LogNogIn',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window (windowed app for system tray)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_file,  # Application icon
    version='version_info.txt',  # Windows version info
)
