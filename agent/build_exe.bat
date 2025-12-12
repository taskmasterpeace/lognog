@echo off
REM Build script for LogNog In Windows EXE
REM This script builds a standalone Windows executable using PyInstaller

echo ========================================
echo Building LogNog In Windows EXE
echo ========================================
echo.

REM Check if we're in the agent directory
if not exist "pyproject.toml" (
    echo Error: Must run from agent directory
    echo Current directory: %CD%
    exit /b 1
)

REM Check if icon file exists
if not exist "assets\lognog.ico" (
    echo Warning: Icon file not found at assets\lognog.ico
    echo The EXE will be built without an icon
    echo.
)

REM Clean previous builds
echo Cleaning previous builds...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
echo.

REM Install/update dependencies including PyInstaller
echo Installing dependencies...
pip install -e ".[dev]"
if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies
    exit /b 1
)
echo.

REM Build with PyInstaller
echo Building executable...
pyinstaller LogNogIn.spec --clean --noconfirm
if %errorlevel% neq 0 (
    echo Error: PyInstaller build failed
    exit /b 1
)
echo.

REM Check if EXE was created
if exist "dist\LogNogIn.exe" (
    echo ========================================
    echo Build successful!
    echo ========================================
    echo.
    echo Executable location: %CD%\dist\LogNogIn.exe
    echo.
    dir dist\LogNogIn.exe
    echo.
    echo You can now run the agent with:
    echo   dist\LogNogIn.exe
    echo.
) else (
    echo Error: Build completed but LogNogIn.exe not found in dist\
    exit /b 1
)
