@echo off
setlocal EnableExtensions

rem Always run from this repo root (folder containing this script).
cd /d "%~dp0"

set "GIT=%ProgramFiles%\Git\bin\git.exe"
if not exist "%GIT%" set "GIT=git"

"%GIT%" add -A
"%GIT%" diff --staged --quiet
if errorlevel 1 goto DO_COMMIT
echo Nothing to commit.
pause
exit /b 0

:DO_COMMIT
if not "%~1"=="" (
  "%GIT%" commit -m "%~1"
) else (
  "%GIT%" commit -m "chore: sync workspace"
)
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo Commit failed with exit code %ERR%.
)
pause
exit /b %ERR%
