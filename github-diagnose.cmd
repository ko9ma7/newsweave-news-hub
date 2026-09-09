@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title NewsWeave - GitHub Diagnostics v1.0.3
set "NW_REPO_NAME=newsweave-news-hub"
echo.
echo ================================================================
echo   NewsWeave - GitHub Diagnostics v1.0.3
echo ================================================================
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\github-diagnose.ps1"
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
