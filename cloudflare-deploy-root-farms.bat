@echo off
setlocal EnableExtensions

rem Build Root Farms and upload to Cloudflare Pages (rootrecord-root-farms-web).
rem Run once after clone: cloudflare-setup-root-farms-once.bat

cd /d "%~dp0"
set WRANGLER_CI=1

pushd "Web\apps\root-farms-web"
if errorlevel 1 exit /b 1
call pnpm install
if errorlevel 1 ( popd & exit /b 1 )
call pnpm run pages:deploy
set ERR=%ERRORLEVEL%
popd
if %ERR% neq 0 exit /b %ERR%
echo.
echo Uploaded. https://farms.rootrecord.info/
exit /b 0
