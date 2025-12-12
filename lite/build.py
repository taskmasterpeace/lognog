#!/usr/bin/env python3
"""
Build script for LogNog Lite

Creates a standalone Windows EXE that runs the LogNog server.

Usage:
    python build.py

By Machine King Labs
"""

import subprocess
import sys
import shutil
from pathlib import Path


def run_command(cmd: list, cwd: Path = None) -> bool:
    """Run a command and return success status."""
    print(f"Running: {' '.join(cmd)}")
    # Use shell=True on Windows for npm commands
    use_shell = sys.platform == 'win32' and cmd[0] == 'npm'
    result = subprocess.run(cmd, cwd=cwd, shell=use_shell)
    return result.returncode == 0


def main():
    print("")
    print("========================================")
    print("   LogNog Lite - Build Script")
    print("   By Machine King Labs")
    print("========================================")
    print("")

    lite_dir = Path(__file__).parent
    project_root = lite_dir.parent
    api_dir = project_root / 'api'
    ui_dir = project_root / 'ui'

    # Step 1: Build API
    print("[1/5] Building API...")
    if not (api_dir / 'node_modules').exists():
        if not run_command(['npm', 'install'], cwd=api_dir):
            print("ERROR: Failed to install API dependencies")
            return 1

    if not run_command(['npm', 'run', 'build'], cwd=api_dir):
        print("ERROR: Failed to build API")
        return 1

    # Step 2: Build UI
    print("\n[2/5] Building UI...")
    if not (ui_dir / 'node_modules').exists():
        if not run_command(['npm', 'install'], cwd=ui_dir):
            print("ERROR: Failed to install UI dependencies")
            return 1

    if not run_command(['npm', 'run', 'build'], cwd=ui_dir):
        print("ERROR: Failed to build UI")
        return 1

    # Step 3: Install Python dependencies
    print("\n[3/5] Installing Python dependencies...")
    if not run_command([sys.executable, '-m', 'pip', 'install', 'pyinstaller', 'pystray', 'Pillow']):
        print("ERROR: Failed to install Python dependencies")
        return 1

    # Step 4: Build EXE with PyInstaller
    print("\n[4/5] Building EXE...")
    if not run_command([
        sys.executable, '-m', 'PyInstaller',
        '--clean',
        '--noconfirm',
        str(lite_dir / 'LogNogLite.spec')
    ], cwd=lite_dir):
        print("ERROR: Failed to build EXE")
        return 1

    # Step 5: Create distribution folder
    print("\n[5/5] Creating distribution package...")
    dist_dir = lite_dir / 'dist'
    package_dir = dist_dir / 'LogNogLite'

    # Clean and create package directory
    if package_dir.exists():
        shutil.rmtree(package_dir)
    package_dir.mkdir(parents=True, exist_ok=True)

    # Move EXE to package
    exe_path = dist_dir / 'LogNogLite.exe'
    if not exe_path.exists():
        print("ERROR: EXE was not created")
        return 1

    shutil.copy2(exe_path, package_dir / 'LogNogLite.exe')

    # Copy API (dist + node_modules)
    api_package = package_dir / 'api'
    api_package.mkdir(exist_ok=True)

    print("  Copying API dist...")
    shutil.copytree(api_dir / 'dist', api_package / 'dist')

    print("  Copying API node_modules (this may take a moment)...")
    shutil.copytree(api_dir / 'node_modules', api_package / 'node_modules')

    # Copy package.json for Node.js
    shutil.copy2(api_dir / 'package.json', api_package / 'package.json')

    # Copy UI dist (static files for the dashboard)
    print("  Copying UI dist...")
    shutil.copytree(ui_dir / 'dist', package_dir / 'ui' / 'dist')

    # Done!
    final_exe = package_dir / 'LogNogLite.exe'
    if final_exe.exists():
        print("")
        print("========================================")
        print("   SUCCESS!")
        print(f"   Package created at: {package_dir}")
        print("========================================")
        print("")
        print("Distribution contents:")
        print("  LogNogLite/")
        print("  +-- LogNogLite.exe    (run this)")
        print("  +-- api/              (server code)")
        print("  +-- ui/               (dashboard)")
        print("")
        print("To distribute: ZIP the LogNogLite folder and share it.")
        print("Users just extract and double-click LogNogLite.exe")
        print("")
    else:
        print("ERROR: Package creation failed")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
