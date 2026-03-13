@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-cloudflare-preview.ps1"
exit /b %errorlevel%
