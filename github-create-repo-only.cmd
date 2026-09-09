@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title NewsWeave - Repository Create + Push (v1.0.3)

set "REPO_NAME=newsweave-news-hub"
set "VISIBILITY=public"
set "BRANCH=main"
set "DESCRIPTION=Multi-topic news collector and rule-based personal news collections for GitHub Pages"

echo.
echo ================================================================
echo   NewsWeave - Repository Create + Push (v1.0.3)
echo ================================================================

where gh >nul 2>&1 || (echo [ERROR] GitHub CLI ^(gh^) not found.& pause & exit /b 1)
where git >nul 2>&1 || (echo [ERROR] Git not found.& pause & exit /b 1)

gh auth status --active -h github.com >nul 2>&1 || (echo [ERROR] GitHub CLI is not authenticated.& echo [RECOVERY] gh auth login -h github.com -p https -s repo,workflow -w & pause & exit /b 1)

set "LOGIN="
for /f "usebackq delims=" %%A in (`gh api user --jq .login 2^>nul`) do set "LOGIN=%%A"
if not defined LOGIN (echo [ERROR] Could not resolve active GitHub account.& pause & exit /b 1)
set "FULL_REPO=%LOGIN%/%REPO_NAME%"
set "REPO_URL=https://github.com/%FULL_REPO%"
set "ORIGIN_URL=%REPO_URL%.git"

echo [OK] Active GitHub account: %LOGIN%
echo [CHECK] Target repository: %FULL_REPO%

gh repo view "%FULL_REPO%" --json url --jq .url >nul 2>&1
if errorlevel 1 (
  echo [CHECK] Repository does not exist. Creating it now...
  gh repo create "%FULL_REPO%" --%VISIBILITY% --description "%DESCRIPTION%"
  if errorlevel 1 (echo [ERROR] gh repo create failed.& echo [RECOVERY] gh repo create "%FULL_REPO%" --%VISIBILITY% --description "%DESCRIPTION%" & pause & exit /b 1)
) else (
  echo [OK] Repository already exists; reusing it.
)

set "VERIFY_URL="
for /f "usebackq delims=" %%A in (`gh repo view "%FULL_REPO%" --json url --jq .url 2^>nul`) do set "VERIFY_URL=%%A"
if /i not "!VERIFY_URL!"=="%REPO_URL%" (
  echo [ERROR] Repository verification failed.
  echo [RECOVERY] gh repo view "%FULL_REPO%" --web
  pause
  exit /b 1
)
echo [OK] VERIFIED repository exists: !VERIFY_URL!

if not exist .git git init
if errorlevel 1 (echo [ERROR] git init failed.& pause & exit /b 1)
git branch -M %BRANCH%

set "ORIGIN="
for /f "usebackq delims=" %%A in (`git remote get-url origin 2^>nul`) do set "ORIGIN=%%A"
if defined ORIGIN (
  if /i not "!ORIGIN!"=="%ORIGIN_URL%" (
    echo [ERROR] Existing origin is different: !ORIGIN!
    echo [RECOVERY] git remote rename origin previous-origin
    pause
    exit /b 1
  )
) else (
  git remote add origin "%ORIGIN_URL%"
  if errorlevel 1 (echo [ERROR] Could not add origin.& pause & exit /b 1)
)

git add -A

git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
  git commit -m "feat: launch NewsWeave multi-topic news collector"
  if errorlevel 1 (echo [ERROR] Initial commit failed.& pause & exit /b 1)
) else (
  git diff --cached --quiet
  if errorlevel 1 (
    git commit -m "chore: update NewsWeave"
    if errorlevel 1 (echo [ERROR] Commit failed.& pause & exit /b 1)
  ) else (
    echo [OK] No new changes to commit.
  )
)

echo [CHECK] Pushing %BRANCH%...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo [ERROR] Push failed.
  echo [RECOVERY] git push -u origin %BRANCH%
  pause
  exit /b 1
)

echo [OK] Repository creation and push are complete.
echo [OK] Repository: %REPO_URL%
start "" "%REPO_URL%"
echo.
echo [NOTE] For Pages + Actions + Release, run github-bootstrap.cmd next.
pause
exit /b 0
