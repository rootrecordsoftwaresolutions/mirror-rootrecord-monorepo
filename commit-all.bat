@echo off
setlocal EnableExtensions

rem =============================================================================
rem  commit-all.bat — stage, commit, and push the entire MonoRepo
rem
rem  One git repo at the folder containing this script. All products live here:
rem    Mobile\          Android (Capacitor + native)
rem    Web\apps\        Product web apps (Pages)
rem    Web\cloudflare\  Workers (auto-discovers rootrecord-* folders)
rem    Web\main\        Marketing site
rem    solana-rootrecord-site\, Bots\, Doc-Repo\, etc.
rem
rem  New projects are picked up automatically when they have package.json,
rem  wrangler.toml, or an Android Gradle project — no edit to this file needed.
rem
rem  Usage:
rem    commit-all.bat
rem    commit-all.bat your commit message here
rem    commit-all.bat nopause          (no pause at end — for scripts)
rem
rem  Nested .git folders (if any) are committed first, then the monorepo root.
rem =============================================================================

cd /d "%~dp0"

set "NOPAUSE=0"
if /I "%~1"=="nopause" set "NOPAUSE=1"

set "PS_ARGS=%*"
if /I "%~1"=="nopause" set "PS_ARGS=%~2 %~3 %~4 %~5 %~6 %~7 %~8 %~9"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\commit-all.ps1" %PS_ARGS%
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo commit-all failed with exit code %ERR%.
  if not "%NOPAUSE%"=="1" pause
  exit /b %ERR%
)

if not "%NOPAUSE%"=="1" pause
exit /b 0
