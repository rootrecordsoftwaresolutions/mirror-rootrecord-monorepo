@echo off
REM Sync local BlueMap web root to R2 + optional Worker redeploy.
REM Usage: cloudflare-sync-bluemap-r2.bat [dry-run]
setlocal
cd /d "%~dp0"
if /I "%~1"=="dry-run" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "Web\cloudflare\rootrecord-minecraft-map\sync-bluemap-r2.ps1" -DryRun
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "Web\cloudflare\rootrecord-minecraft-map\sync-bluemap-r2.ps1"
)
exit /b %ERRORLEVEL%
