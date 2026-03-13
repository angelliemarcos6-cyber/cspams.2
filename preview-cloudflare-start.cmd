@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-cloudflare-preview.ps1"
exit /b %errorlevel%
