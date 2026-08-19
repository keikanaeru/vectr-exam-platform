@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-stateful-k6-v1-2.ps1"
exit /b %errorlevel%
