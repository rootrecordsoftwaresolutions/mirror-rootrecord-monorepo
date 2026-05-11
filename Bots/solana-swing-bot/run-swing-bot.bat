@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] No virtual environment found in "%~dp0.venv"
  echo Create it with:
  echo   python -m venv .venv
  echo   .venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

echo Starting solana-swing-bot from "%CD%" ...
echo.
".venv\Scripts\python.exe" main.py
set "EC=%ERRORLEVEL%"
echo.
echo Process exited with code %EC%.
pause
exit /b %EC%
