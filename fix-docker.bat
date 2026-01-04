@echo off
echo === LogNog Docker Recovery ===
powershell -ExecutionPolicy Bypass -File "%~dp0fix-docker.ps1"
pause
