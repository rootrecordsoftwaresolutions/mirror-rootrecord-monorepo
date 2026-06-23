@echo off
setlocal EnableExtensions

rem Deploys Cloudflare Pages projects in this monorepo (no Workers).
rem Requires Node + npm + pnpm on PATH and Wrangler auth (credentials.env or wrangler login).
rem All web app sources live under Web\apps\* and are isolated from Mobile\* (Android).
rem
rem Usage:
rem   cloudflare-update-pages.bat                - deploy ALL Pages projects
rem   cloudflare-update-pages.bat <name>         - deploy ONE Pages project
rem
rem Valid <name> values:
rem   website                                    - Web\main (marketing)
rem   weather  business  account  token  kilauea  farms  visiting-hawaii  goals  realm - per-product web app

cd /d "%~dp0"
set "LOGFILE=%~dp0cloudflare-update-pages.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

set "ONLY=%~1"
if not "%ONLY%"=="" goto SINGLE

echo.
echo ================================
echo RootRecord Cloudflare - Pages (ALL)
echo ================================
echo Repo: %CD%
echo.

set "STEP=init"
set "ERR=0"

set "STEP=[1/10] Pages: rootrecord-website (marketing, Web\main)"
echo %STEP%
pushd "Web\main"
if errorlevel 1 goto FAIL
call npm ci
if errorlevel 1 ( popd & goto FAIL )
call npm run pages:deploy --silent
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[2/10] Pages: rootrecord-weather-web (Web\apps\weather-manager-web)"
echo %STEP%
pushd "Web\apps\weather-manager-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[3/10] Pages: rootrecord-business-web (Web\apps\business-manager-web)"
echo %STEP%
pushd "Web\apps\business-manager-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[4/10] Pages: rootrecord-account-web (Web\apps\account-hub-web)"
echo %STEP%
pushd "Web\apps\account-hub-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[5/10] Pages: rootrecord-token-web (Web\apps\token-manager-web)"
echo %STEP%
pushd "Web\apps\token-manager-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[6/10] Pages: rootrecord-kilauea-web (Web\apps\kilauea-alerts-web)"
echo %STEP%
pushd "Web\apps\kilauea-alerts-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[7/10] Pages: rootrecord-root-farms-web (Web\apps\root-farms-web)"
echo %STEP%
pushd "Web\apps\root-farms-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[8/10] Pages: rootrecord-visiting-hawaii-web (Web\apps\visiting-hawaii-web)"
echo %STEP%
pushd "Web\apps\visiting-hawaii-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[9/10] Pages: rootrecord-goals-web (Web\apps\root-goals-web)"
echo %STEP%
pushd "Web\apps\root-goals-web"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

set "STEP=[10/10] Pages: rootrecord-realm-web redirect to rootmc.net (Web\apps\realm-web)"
echo %STEP%
pushd "Web\apps\realm-web"
if errorlevel 1 goto FAIL
call pnpm run pages:deploy
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo Pages done.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
if not "%RR_DEPLOY_NO_PAUSE%"=="1" pause
endlocal
exit /b 0

rem ----------------------------------------------------------------------------
rem Single-page deploy path.
rem ----------------------------------------------------------------------------
:SINGLE
echo.
echo ================================
echo RootRecord Cloudflare - Pages: %ONLY%
echo ================================
echo.

set "TARGET="
set "PKG="
if /I "%ONLY%"=="website"  ( set "TARGET=Web\main"                            & set "PKG=npm" )
if /I "%ONLY%"=="weather"  ( set "TARGET=Web\apps\weather-manager-web"        & set "PKG=pnpm" )
if /I "%ONLY%"=="business" ( set "TARGET=Web\apps\business-manager-web"       & set "PKG=pnpm" )
if /I "%ONLY%"=="account"  ( set "TARGET=Web\apps\account-hub-web"            & set "PKG=pnpm" )
if /I "%ONLY%"=="token"    ( set "TARGET=Web\apps\token-manager-web"          & set "PKG=pnpm" )
if /I "%ONLY%"=="kilauea"  ( set "TARGET=Web\apps\kilauea-alerts-web"         & set "PKG=pnpm" )
if /I "%ONLY%"=="farms"    ( set "TARGET=Web\apps\root-farms-web"             & set "PKG=pnpm" )
if /I "%ONLY%"=="visiting-hawaii" ( set "TARGET=Web\apps\visiting-hawaii-web" & set "PKG=pnpm" )
if /I "%ONLY%"=="visiting" ( set "TARGET=Web\apps\visiting-hawaii-web"         & set "PKG=pnpm" )
if /I "%ONLY%"=="goals"    ( set "TARGET=Web\apps\root-goals-web"               & set "PKG=pnpm" )
if /I "%ONLY%"=="realm"    ( set "TARGET=Web\apps\realm-web"                    & set "PKG=pnpm" )

if "%TARGET%"=="" (
  echo Unknown Pages project: %ONLY%
  echo Valid: website weather business account token kilauea farms visiting-hawaii goals realm
  pause
  endlocal
  exit /b 1
)

set "STEP=deploy %TARGET%"
echo %STEP%
pushd "%TARGET%"
if errorlevel 1 goto FAIL
if /I "%PKG%"=="npm" (
  call npm ci
  if errorlevel 1 ( popd & goto FAIL )
  call npm run pages:deploy --silent
  if errorlevel 1 ( popd & goto FAIL )
) else (
  call pnpm install
  if errorlevel 1 ( popd & goto FAIL )
  call pnpm run pages:deploy
  if errorlevel 1 ( popd & goto FAIL )
)
popd

echo.
echo Pages %ONLY% done.
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
if not "%RR_DEPLOY_NO_PAUSE%"=="1" pause
endlocal
exit /b %ERR%
