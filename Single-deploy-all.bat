@echo off
setlocal EnableExtensions

rem Deploy ALL Cloudflare Workers (API shards + license + app-build) then ALL Pages projects.
rem Requires Node, npm, pnpm, Wrangler auth (repo-root credentials.env or wrangler login).
rem
rem Usage:
rem   Single-deploy-all.bat           - workers, then pages (one log, one pause at end)
rem   Single-deploy-all.bat nopause   - same, exit when done (for scripts / CI)
rem
rem Skipped: rootrecord-primary (legacy), rootrecord-solana-tx (frozen).
rem Does NOT build Android APKs — run Mobile release scripts separately.

cd /d "%~dp0"

set "NOPAUSE=0"
if /I "%~1"=="nopause" set "NOPAUSE=1"
rem Child scripts skip their own pauses; this wrapper pauses once at the end.
set "RR_DEPLOY_NO_PAUSE=1"

set "LOGFILE=%~dp0Single-deploy-all.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

echo.
echo ================================
echo RootRecord — deploy ALL (Workers + Pages)
echo ================================
echo Repo: %CD%
echo.

set "STEP=cloudflare-update-workers.bat"
echo [%STEP%]
call "%~dp0cloudflare-update-workers.bat"
if errorlevel 1 goto FAIL

set "STEP=cloudflare-update-pages.bat"
echo [%STEP%]
call "%~dp0cloudflare-update-pages.bat"
if errorlevel 1 goto FAIL

echo.
echo All Workers and Pages deploys finished OK.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: Single-deploy-all.bat failed.
echo Step:      %STEP%
echo Exit code: %ERR%
echo Log:       %LOGFILE%
echo ============================================================
echo FAILED at %STEP% exit %ERR% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b %ERR%
