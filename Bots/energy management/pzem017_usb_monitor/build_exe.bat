@echo off
setlocal
cd /d "%~dp0"

echo Building Pzem017Monitor.exe ...
python -m PyInstaller --onefile --windowed --name Pzem017Monitor --noconfirm --hidden-import serial.tools.list_ports --hidden-import matplotlib.backends.backend_tkagg --collect-all matplotlib pzem017_monitor.py

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo Done: dist\Pzem017Monitor.exe
exit /b 0
