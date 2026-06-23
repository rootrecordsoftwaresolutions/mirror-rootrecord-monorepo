@echo off
REM Deploy rootrecord-minecraft-map Worker (HTTPS proxy for BlueMap at map.rootrecord.info).
cd /d "%~dp0"
call cloudflare-update-workers.bat minecraft-map %*
exit /b %ERRORLEVEL%
