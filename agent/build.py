#!/usr/bin/env python3
"""
Build script for LogNog In agent.

This script builds a standalone executable using PyInstaller.
On Windows, it creates a windowed application with system tray support.
"""

import shutil
import subprocess
import sys
from pathlib import Path


def main():
    """Main build function."""
    # Ensure we're in the agent directory
    script_dir = Path(__file__).parent
    if not (script_dir / "pyproject.toml").exists():
        print("Error: Must run from agent directory")
        print(f"Current directory: {script_dir}")
        return 1

    # Check if icon file exists
    icon_file = script_dir / "assets" / "lognog.ico"
    if not icon_file.exists():
        print(f"Warning: Icon file not found at {icon_file}")
        print("The executable will be built without an icon")
        print()

    # Clean previous builds
    print("Cleaning previous builds...")
    for dir_name in ["build", "dist"]:
        dir_path = script_dir / dir_name
        if dir_path.exists():
            shutil.rmtree(dir_path)
            print(f"  Removed {dir_path}")
    print()

    # Install/update dependencies including PyInstaller
    print("Installing dependencies...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-e", ".[dev]"],
        cwd=script_dir,
    )
    if result.returncode != 0:
        print("Error: Failed to install dependencies")
        return 1
    print()

    # Build with PyInstaller
    print("Building executable...")
    spec_file = script_dir / "LogNogIn.spec"
    result = subprocess.run(
        [sys.executable, "-m", "PyInstaller", str(spec_file), "--clean", "--noconfirm"],
        cwd=script_dir,
    )
    if result.returncode != 0:
        print("Error: PyInstaller build failed")
        return 1
    print()

    # Check if executable was created
    exe_name = "LogNogIn.exe" if sys.platform == "win32" else "LogNogIn"
    exe_path = script_dir / "dist" / exe_name

    if exe_path.exists():
        print("=" * 50)
        print("Build successful!")
        print("=" * 50)
        print()
        print(f"Executable location: {exe_path}")
        print(f"Size: {exe_path.stat().st_size / (1024*1024):.2f} MB")
        print()
        print("You can now run the agent with:")
        print(f"  {exe_path}")
        print()
        print("Usage examples:")
        print(f"  {exe_path} --help")
        print(f"  {exe_path} init --server http://localhost --api-key YOUR_KEY")
        print(f"  {exe_path} test")
        print(f"  {exe_path} status")
        print(f"  {exe_path}  # Start with system tray")
        print()
        return 0
    else:
        print(f"Error: Build completed but {exe_name} not found in dist/")
        return 1


if __name__ == "__main__":
    sys.exit(main())
