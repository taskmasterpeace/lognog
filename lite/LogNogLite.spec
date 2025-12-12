# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for LogNog Lite launcher.

This creates a Windows EXE that:
- Shows a system tray icon
- Launches the Node.js API server (shipped alongside)
- Opens browser to dashboard

The build.py script creates the full distribution package with:
- LogNogLite.exe (this launcher)
- api/ folder (Node.js server + node_modules)
- ui/ folder (dashboard static files)

By Machine King Labs
"""

import sys
from pathlib import Path

# Paths
lite_root = Path(SPECPATH)
project_root = lite_root.parent
src_dir = lite_root / 'src'
assets_dir = lite_root / 'assets'

# Icon
icon_file = project_root / 'ui' / 'public' / 'favicon.ico'
if not icon_file.exists():
    icon_file = None
else:
    icon_file = str(icon_file)

block_cipher = None

# Data files (only assets - API/UI are shipped alongside EXE)
datas = []

# Add assets for tray icon
if assets_dir.exists():
    datas.append((str(assets_dir), 'assets'))

a = Analysis(
    [str(src_dir / 'lognog_lite.py')],
    pathex=[str(src_dir), str(lite_root)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL._tkinter_finder',
        'tkinter',
        'tkinter.messagebox',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'pytest',
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
    name='LogNogLite',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_file,
)
