@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restart-cloudflare-preview.ps1"
exit /b %errorlevel%
