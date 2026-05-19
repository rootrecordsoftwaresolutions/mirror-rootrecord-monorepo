@echo off
setlocal EnableExtensions

rem ONE TIME: create Pages project + farms.rootrecord.info DNS (credentials.env).
rem After this, only run cloudflare-deploy-root-farms.bat when you change the web app.

cd /d "%~dp0"
set WRANGLER_CI=1
powershell -NoProfile -ExecutionPolicy Bypass -File "Web\scripts\setup-root-farms-pages-dns.ps1"
if errorlevel 1 exit /b 1
echo.
echo Setup done. Use cloudflare-deploy-root-farms.bat for future uploads.
exit /b 0
