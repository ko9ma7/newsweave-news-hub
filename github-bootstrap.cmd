@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title NewsWeave - GitHub Bootstrap v1.0.3

rem ==========================================================================
rem Edit only this block for your GitHub repository.
rem Leave REPO_OWNER blank to use the ACTIVE GitHub CLI account.
rem ==========================================================================
set "NW_REPO_NAME=newsweave-news-hub"
set "NW_REPO_OWNER="
set "NW_REPO_DESCRIPTION=Multi-topic news collector and rule-based personal news collections for GitHub Pages"
set "NW_REPO_VISIBILITY=public"
set "NW_DEFAULT_BRANCH=main"
set "NW_INITIAL_TAG=v1.0.3"
set "NW_INITIAL_COMMIT=feat: launch NewsWeave multi-topic news collector"
set "NW_UPDATE_COMMIT=chore: provision NewsWeave GitHub repository"
set "NW_TOPICS=news news-aggregator rss github-pages indexeddb knowledge-management automation static-site vanilla-javascript"
set "NW_CUSTOM_SITE_URL="
set "NW_AUTO_INSTALL=1"
set "NW_CREATE_RELEASE=1"
set "NW_OPEN_REPO=1"
rem ==========================================================================

echo.
echo ================================================================
echo   NewsWeave - GitHub Repository + Pages Bootstrap v1.0.3
echo ================================================================
echo [CHECK] Project folder: %CD%
echo [NOTE] The active GitHub CLI account will own the repository unless
 echo        NW_REPO_OWNER is explicitly set above.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\github-bootstrap.ps1"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] NewsWeave bootstrap finished successfully.
) else (
  echo [ERROR] NewsWeave bootstrap stopped with exit code %RC%.
)
echo [NOTE] Review github-bootstrap.log and github-bootstrap-result.txt in this folder.
echo.
pause
exit /b %RC%
