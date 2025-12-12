@echo off
:: LogNog In Agent - Uninstall Script
:: Run as Administrator

echo.
echo  LogNog In Agent Uninstaller
echo  ===========================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Please run as Administrator.
    pause
    exit /b 1
)

set INSTALL_DIR=%ProgramFiles%\LogNog In
set EXE_NAME=LogNogIn.exe

:: Confirm
set /p CONFIRM="Uninstall LogNog In? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Cancelled.
    pause
    exit /b 0
)

:: Stop running instance
echo Stopping LogNog In...
taskkill /F /IM %EXE_NAME% >nul 2>&1
timeout /t 2 >nul

:: Remove from startup
echo Removing startup entry...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "LogNogIn" /f >nul 2>&1

:: Remove Start Menu shortcut
echo Removing shortcuts...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\LogNog In.lnk" >nul 2>&1
del "%USERPROFILE%\Desktop\LogNog In.lnk" >nul 2>&1

:: Remove install directory
echo Removing files...
if exist "%INSTALL_DIR%" rmdir /S /Q "%INSTALL_DIR%"

:: Note about config
echo.
echo Uninstall complete!
echo.
echo NOTE: Configuration and data files were NOT removed.
echo They are located at:
echo   %LOCALAPPDATA%\MachineKingLabs\lognog-in\
echo.
echo Delete this folder manually if you want to remove all data.
echo.

pause
