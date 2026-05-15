@echo off
setlocal EnableExtensions

rem Deploys Cloudflare Workers in this monorepo (no Pages).
rem Requires Node + npm on PATH and Wrangler auth (credentials.env or wrangler login).
rem
rem Usage:
rem   cloudflare-update-workers.bat                  - deploy ALL workers
rem   cloudflare-update-workers.bat <name>           - deploy ONE worker
rem   cloudflare-update-workers.bat <name> nopause   - same, no pause (for calling scripts)
rem
rem Valid <name> values:
rem   weather  business  account  token  kilauea    - per-product API shard
rem   license                                        - rootrecord-license
rem   app-build                                      - rootrecord-app-build
rem
rem Skipped intentionally (legacy / frozen):
rem   rootrecord-primary       (phased out; shards still read its .deploy-jwt read-only)
rem   rootrecord-solana-tx     (frozen; manual `npx wrangler deploy` if ever needed)
rem   rr-weather-manager-api   (decommissioned; routes merged into shards)
rem
rem DISCORD_BOT_TOKEN (developer feed sync): uploaded only by Web\cloudflare\rootrecord-api-account\deploy.ps1
rem when DISCORD_BOT_TOKEN is set in repo-root credentials.env (not by other shard deploy.ps1).

cd /d "%~dp0"
set "LOGFILE=%~dp0cloudflare-update-workers.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

set "ONLY=%~1"
if not "%ONLY%"=="" goto SINGLE

echo.
echo ================================
echo RootRecord Cloudflare - Workers (ALL)
echo ================================
echo Repo: %CD%
echo.

set "STEP=init"
set "ERR=0"

rem Web\cloudflare\shared\password-verify.ts imports @noble/hashes/*; esbuild resolves those
rem imports starting from the shared/ directory, so it needs its own node_modules.

set "STEP=[1/4] shared (node_modules for Web\cloudflare\shared)"
echo %STEP%
pushd "Web\cloudflare\shared"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[2/4] API shards (weather/business/account/token/kilauea)"
echo %STEP%
pushd "Web\cloudflare"
if errorlevel 1 goto FAIL
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-api-shards.ps1"
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[3/4] rootrecord-license"
echo %STEP%
pushd "Web\cloudflare\rootrecord-license"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[4/4] rootrecord-app-build"
echo %STEP%
pushd "Web\cloudflare\rootrecord-app-build"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo Workers done.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
pause
endlocal
exit /b 0

rem ----------------------------------------------------------------------------
rem Single-worker deploy path: skip everything except the one requested.
rem ----------------------------------------------------------------------------
:SINGLE
set "NOPAUSE=0"
if /I "%~2"=="nopause" set "NOPAUSE=1"
echo.
echo ================================
echo RootRecord Cloudflare - Worker: %ONLY%
echo ================================
echo.

set "TARGET="
if /I "%ONLY%"=="weather"   set "TARGET=Web\cloudflare\rootrecord-api-weather"
if /I "%ONLY%"=="business"  set "TARGET=Web\cloudflare\rootrecord-api-business"
if /I "%ONLY%"=="account"   set "TARGET=Web\cloudflare\rootrecord-api-account"
if /I "%ONLY%"=="token"     set "TARGET=Web\cloudflare\rootrecord-api-token"
if /I "%ONLY%"=="kilauea"   set "TARGET=Web\cloudflare\rootrecord-api-kilauea"
if /I "%ONLY%"=="license"   set "TARGET=Web\cloudflare\rootrecord-license"
if /I "%ONLY%"=="app-build" set "TARGET=Web\cloudflare\rootrecord-app-build"

if "%TARGET%"=="" (
  echo Unknown worker: %ONLY%
  echo Valid: weather business account token kilauea license app-build
  if not "%NOPAUSE%"=="1" pause
  endlocal
  exit /b 1
)

rem All shards import from Web\cloudflare\shared\, so refresh its node_modules too.
set "STEP=shared (node_modules for Web\cloudflare\shared)"
echo %STEP%
pushd "Web\cloudflare\shared"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=deploy %TARGET%"
echo %STEP%
pushd "%TARGET%"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo Worker %ONLY% done.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
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
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b %ERR%
