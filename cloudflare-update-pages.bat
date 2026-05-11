@echo off
setlocal EnableExtensions

rem Deploys all Cloudflare Pages projects in this monorepo (no Workers).
rem Requires Node + npm + pnpm on PATH and Wrangler auth (credentials.env or wrangler login).
rem All web app sources live under Web\apps\* and are isolated from Mobile\* (Android).

cd /d "%~dp0"

set "LOGFILE=%~dp0cloudflare-update-pages.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

echo.
echo ================================
echo RootRecord Cloudflare - Pages
echo ================================
echo Repo: %CD%
echo.

set "STEP=init"
set "ERR=0"

rem Pages projects:
rem   rootrecord-website        -> Web\main                            (marketing static + Functions)
rem   rootrecord-weather-web    -> Web\apps\weather-manager-web        (React/CRA)
rem   rootrecord-business-web   -> Web\apps\business-manager-web       (React/CRA)
rem   rootrecord-account-web    -> Web\apps\account-hub-web            (React/CRA)
rem   rootrecord-token-web      -> Web\apps\token-manager-web          (React/CRA)
rem   rootrecord-kilauea-web    -> Web\apps\kilauea-alerts-web         (Vite + React)

set "STEP=[1/6] Pages: rootrecord-website (marketing, Web\main)"
echo %STEP%
pushd "Web\main"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call npm run pages:deploy --silent
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[2/6] Pages: rootrecord-weather-web (Web\apps\weather-manager-web)"
echo %STEP%
pushd "Web\apps\weather-manager-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[3/6] Pages: rootrecord-business-web (Web\apps\business-manager-web)"
echo %STEP%
pushd "Web\apps\business-manager-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[4/6] Pages: rootrecord-account-web (Web\apps\account-hub-web)"
echo %STEP%
pushd "Web\apps\account-hub-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[5/6] Pages: rootrecord-token-web (Web\apps\token-manager-web)"
echo %STEP%
pushd "Web\apps\token-manager-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[6/6] Pages: rootrecord-kilauea-web (Web\apps\kilauea-alerts-web)"
echo %STEP%
pushd "Web\apps\kilauea-alerts-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo Pages done.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: cloudflare-update-pages.bat failed.
echo Step:       %STEP%
echo Exit code:  %ERR%
echo CWD:        %CD%
echo ============================================================
echo FAILED at step "%STEP%" exit %ERR% >> "%LOGFILE%"
pause
endlocal
exit /b %ERR%
