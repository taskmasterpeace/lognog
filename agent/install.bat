@echo off
:: LogNog In Agent - Simple Install Script
:: Run as Administrator for best results

echo.
echo  LogNog In Agent Installer
echo  ========================
echo  Machine King Labs
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Not running as Administrator.
    echo Some features may not work correctly.
    echo.
)

:: Set install directory
set INSTALL_DIR=%ProgramFiles%\LogNog In
set EXE_NAME=LogNogIn.exe

:: Check if EXE exists in current directory or dist folder
if exist "%~dp0dist\%EXE_NAME%" (
    set SOURCE=%~dp0dist\%EXE_NAME%
) else if exist "%~dp0%EXE_NAME%" (
    set SOURCE=%~dp0%EXE_NAME%
) else (
    echo ERROR: Cannot find %EXE_NAME%
    echo Please run this script from the agent directory.
    pause
    exit /b 1
)

echo Source: %SOURCE%
echo Install to: %INSTALL_DIR%
echo.

:: Stop running instance
echo Stopping any running instances...
taskkill /F /IM %EXE_NAME% >nul 2>&1

:: Create install directory
echo Creating install directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy files
echo Copying files...
copy /Y "%SOURCE%" "%INSTALL_DIR%\" >nul
if exist "%~dp0assets\lognog.ico" copy /Y "%~dp0assets\lognog.ico" "%INSTALL_DIR%\" >nul

:: Create Start Menu shortcut
echo Creating Start Menu shortcut...
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\LogNog In.lnk
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%INSTALL_DIR%\%EXE_NAME%'; $s.IconLocation = '%INSTALL_DIR%\lognog.ico'; $s.Save()"

echo.
echo Installation complete!
echo.
echo To start LogNog In:
echo   - Find "LogNog In" in the Start Menu
echo   - Or run: "%INSTALL_DIR%\%EXE_NAME%"
echo.
echo To configure:
echo   - Double-click the system tray icon, or
echo   - Right-click and select "Configure..."
echo.

:: Ask to start now
set /p START="Start LogNog In now? (Y/N): "
if /i "%START%"=="Y" (
    start "" "%INSTALL_DIR%\%EXE_NAME%"
    echo LogNog In started. Check the system tray.
)

echo.
pause
