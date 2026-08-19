@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-golden-full.ps1"
exit /b %errorlevel%
