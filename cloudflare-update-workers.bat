@echo off
setlocal EnableExtensions

rem Deploys all Cloudflare Workers in this monorepo (no Pages).
rem Requires Node + npm on PATH and Wrangler auth (credentials.env or wrangler login).

cd /d "%~dp0"

set "LOGFILE=%~dp0cloudflare-update-workers.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

echo.
echo ================================
echo RootRecord Cloudflare - Workers
echo ================================
echo Repo: %CD%
echo.

set "STEP=init"
set "ERR=0"

rem Web\cloudflare\shared\password-verify.ts imports @noble/hashes/*; esbuild resolves those
rem imports starting from the shared/ directory, so it needs its own node_modules.
rem rootrecord-primary is intentionally NOT deployed (being phased out). Shards still read
rem .deploy-jwt / .deploy-internal-wallet-key from rootrecord-primary\ (read-only).

set "STEP=[1/5] shared (node_modules for Web\cloudflare\shared)"
echo %STEP%
pushd "Web\cloudflare\shared"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[2/5] API shards (weather/business/account/token/kilauea)"
echo %STEP%
pushd "Web\cloudflare"
if errorlevel 1 goto FAIL
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-api-shards.ps1" %*
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[3/5] rootrecord-license"
echo %STEP%
pushd "Web\cloudflare\rootrecord-license"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %*
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[4/5] rootrecord-solana-tx"
echo %STEP%
pushd "Web\cloudflare\rootrecord-solana-tx"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %*
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[5/5] rootrecord-app-build + rr-weather-manager-api"
echo %STEP%
pushd "Web\cloudflare\rootrecord-app-build"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call npx wrangler deploy %*
if errorlevel 1 ( popd & goto FAIL )
popd

pushd "Web\cloudflare\rr-weather-manager-api"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call npx wrangler d1 migrations apply USER_DATA_DB --remote
if errorlevel 1 ( popd & goto FAIL )
call npx wrangler deploy %*
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo Workers done.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: cloudflare-update-workers.bat failed.
echo Step:       %STEP%
echo Exit code:  %ERR%
echo CWD:        %CD%
echo ============================================================
echo FAILED at step "%STEP%" exit %ERR% >> "%LOGFILE%"
pause
endlocal
exit /b %ERR%
