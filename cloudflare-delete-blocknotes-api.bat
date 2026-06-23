@echo off
setlocal EnableExtensions

rem Deletes legacy BlockNotes / RootMC API Workers from the RootRecord Cloudflare account:
rem   rootrecord-api-blocknotes, rootrecord-api-rootmc, rootmc-realm-api
rem
rem Production API: rootmc-api at https://api.rootmc.net/ (RootMC Cloudflare account).
rem Deploy first:  powershell -File Web\cloudflare\rootmc-api\deploy.ps1
rem
rem Repo source Web\cloudflare\rootmc-realm-api\ is kept (library for rootmc-api) — only
rem the deployed Workers on RootRecord are removed.

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "Web\cloudflare\scripts\delete-rootrecord-blocknotes-workers.ps1"
exit /b %ERRORLEVEL%
