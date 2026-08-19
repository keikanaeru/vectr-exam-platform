@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-stateful-k6-resume-200.ps1"
exit /b %errorlevel%
