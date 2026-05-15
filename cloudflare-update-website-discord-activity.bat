@echo off
setlocal EnableExtensions
rem Discord stack only: (1) rootrecord-api-account Worker — NOT other Workers.
rem                     (2) rootrecord-website (Web\main): /discord-activity/, _redirects, Pages Functions.
rem pages:deploy uses --branch main so the custom domain updates.

cd /d "%~dp0"

echo.
echo [1/2] rootrecord-api-account Worker only
echo.

pushd "Web\cloudflare\shared"
if errorlevel 1 goto ERR
call npm ci
if errorlevel 1 ( popd & goto ERR )
popd

pushd "Web\cloudflare\rootrecord-api-account"
if errorlevel 1 goto ERR
call npm ci
if errorlevel 1 ( popd & goto ERR )
call powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
if errorlevel 1 ( popd & goto ERR )
popd

echo.
echo [2/2] rootrecord-website (Web\main) - discord-activity + marketing
echo.

pushd "Web\main"
if errorlevel 1 goto ERR
call npm run pages:deploy
if errorlevel 1 ( popd & goto ERR )
popd

echo.
echo Done: api-account + rootrecord-website.
pause
endlocal
exit /b 0

:ERR
echo.
echo ERROR: step failed (see output above).
pause
endlocal
exit /b 1
