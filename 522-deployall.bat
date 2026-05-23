@echo off
setlocal EnableExtensions

rem 2026-05-22/23 Root Farms deploy wrapper.
rem Deploys only the web/worker surfaces touched by the current Root Farms update:
rem   - Solana tx Worker (ROOTS mint + partial-sign transaction route)
rem   - account Worker secrets/migrations/code (farms state, app session tracking, Discord commands)
rem   - Root Farms web (orchard app-bonus trees + farms UI)
rem   - Kilauea Alerts web (Volcano tree app-session signal)
rem   - Discord slash command registration
rem
rem Usage:
rem   522-deployall.bat           - deploy Root Farms web/worker update, pause at end
rem   522-deployall.bat nopause   - same, exit when done

cd /d "%~dp0"

set "NOPAUSE=0"
if /I "%~1"=="nopause" set "NOPAUSE=1"

rem Child scripts skip their own pauses; this wrapper pauses once at the end.
set "RR_DEPLOY_NO_PAUSE=1"

set "LOGFILE=%~dp0522-deployall.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

echo.
echo ================================
echo RootRecord - 5/22-23 Root Farms web/worker deploy
echo ================================
echo Repo: %CD%
echo Scope: solana-tx Worker + account Worker/D1 + Root Farms web + Kilauea web + Discord command registration.
echo.

set "STEP=rootrecord-solana-tx deploy"
echo [%STEP%]
pushd "Web\cloudflare\rootrecord-solana-tx"
if errorlevel 1 goto FAIL
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=rootrecord-api-account deploy"
echo [%STEP%]
pushd "Web\cloudflare\rootrecord-api-account"
if errorlevel 1 goto FAIL
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
if errorlevel 1 ( popd & goto FAIL )

set "STEP=discord command registration"
echo [%STEP%]
call node ".\scripts\discord-register-root-units-commands.mjs"
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=Root Farms web Pages deploy"
echo [%STEP%]
pushd "Web\apps\root-farms-web"
if errorlevel 1 goto FAIL
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=Kilauea Alerts web Pages deploy"
echo [%STEP%]
pushd "Web\apps\kilauea-alerts-web"
if errorlevel 1 goto FAIL
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo 5/22-23 Root Farms web/worker deploy finished OK.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: 522-deployall.bat failed.
echo Step:      %STEP%
echo Exit code: %ERR%
echo Log:       %LOGFILE%
echo ============================================================
echo FAILED at %STEP% exit %ERR% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b %ERR%
