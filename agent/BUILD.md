# Building LogNog In Windows EXE

This document describes how to build a standalone Windows executable for the LogNog In agent.

## Prerequisites

- Python 3.10 or higher
- Windows operating system (for building Windows EXE)
- All dependencies installed (see `pyproject.toml`)

## Quick Start

### Option 1: Using Python Build Script (Recommended)

```bash
cd C:\git\spunk\agent
python build.py
```

### Option 2: Using Windows Batch Script

```bash
cd C:\git\spunk\agent
build_exe.bat
```

### Option 3: Manual Build

```bash
cd C:\git\spunk\agent
pip install -e ".[dev]"
pyinstaller LogNogIn.spec --clean --noconfirm
```

## Build Output

After a successful build, you'll find:

- **Executable**: `dist\LogNogIn.exe` (approximately 82 MB)
- **Build artifacts**: `build\` directory (can be deleted)

## Build Configuration

The build is configured via `LogNogIn.spec`:

- **Entry point**: `src/lognog_in/main.py`
- **Icon**: `assets/lognog.ico`
- **Mode**: Windowed (no console) for system tray support
- **Type**: Single-file executable (onefile mode)
- **Compression**: UPX enabled for smaller size

## Key Features

1. **System Tray Support**: Built as a windowed application (not console) to support the pystray system tray icon
2. **Embedded Icon**: The lognog.ico file is embedded in the EXE and bundled as a data file
3. **All Dependencies Bundled**: httpx, watchdog, pystray, Pillow, PyYAML, and appdirs are all included
4. **Single File**: Everything bundled into one LogNogIn.exe file

## Testing the Build

After building, test the executable:

```bash
# Show version
dist\LogNogIn.exe --version

# Show help
dist\LogNogIn.exe --help

# Initialize configuration
dist\LogNogIn.exe init --server http://localhost:8080 --api-key YOUR_API_KEY

# Test connection
dist\LogNogIn.exe test

# Show status
dist\LogNogIn.exe status

# Run with system tray
dist\LogNogIn.exe
```

## Troubleshooting

### Build Fails

1. Ensure all dependencies are installed: `pip install -e ".[dev]"`
2. Clean previous builds: `rmdir /s /q build dist`
3. Check Python version: `python --version` (must be 3.10+)

### Icon Not Found

The build will still succeed without the icon, but the EXE won't have a custom icon. Ensure `assets/lognog.ico` exists.

### Import Errors at Runtime

If the built EXE fails with import errors:

1. Check `LogNogIn.spec` and add missing modules to `hiddenimports`
2. Run PyInstaller with `--debug all` for verbose output
3. Check the warnings in `build/LogNogIn/warn-LogNogIn.txt`

### Large File Size

The EXE includes:
- Python runtime
- All dependencies (httpx, watchdog, pystray, PIL, etc.)
- PySide6 (Qt) for matplotlib backend support

To reduce size, you could:
- Disable UPX compression (currently enabled)
- Remove unused matplotlib backends
- Use `--exclude-module` for unnecessary imports

## Distribution

The built `LogNogIn.exe` is fully standalone and can be:

- Copied to any Windows system
- Run without Python installed
- Distributed as a single file

No additional files or installation required!

## Build Time

Typical build time: 1-2 minutes on modern hardware

## Build Artifacts

After building, the directory structure:

```
agent/
├── build/              # Intermediate build files (can delete)
├── dist/
│   └── LogNogIn.exe   # Final executable (82 MB)
├── LogNogIn.spec      # PyInstaller configuration
├── build.py           # Python build script
└── build_exe.bat      # Windows batch build script
```

## Continuous Integration

For automated builds, use the Python script:

```bash
python build.py
```

This script:
1. Cleans previous builds
2. Installs dependencies
3. Runs PyInstaller
4. Verifies the output
5. Returns appropriate exit codes for CI/CD

## Version Information

The version is defined in `src/lognog_in/__init__.py`:

```python
__version__ = "0.1.0"
```

Update this before building a new release.
