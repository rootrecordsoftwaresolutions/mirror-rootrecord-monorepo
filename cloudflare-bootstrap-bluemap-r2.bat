@echo off
REM Bootstrap BlueMap web shell from map.rootrecord.info into R2.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "Web\cloudflare\rootrecord-minecraft-map\bootstrap-bluemap-r2.ps1"
exit /b %ERRORLEVEL%
