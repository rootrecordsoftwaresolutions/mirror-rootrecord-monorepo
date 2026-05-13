@echo off
setlocal EnableExtensions
rem Deploy ONLY rootrecord-website (Web\main): discord-activity at /discord-activity/ plus _redirects
rem and Pages Functions. Skips npm ci / other Pages apps.
rem pages-deploy.ps1 passes --branch main so the custom domain updates (not only the hash *.pages.dev URL).
rem If Web\main package.json or devDependencies changed, run: cloudflare-update-pages.bat website

cd /d "%~dp0"
set "STEP=rootrecord-website (Web\main) - discord-activity + marketing"
echo.
echo %STEP%
echo.

pushd "Web\main"
if errorlevel 1 (
  echo ERROR: cannot cd to Web\main
  pause
  exit /b 1
)

call npm run pages:deploy
set "ERR=%ERRORLEVEL%"
popd

if not "%ERR%"=="0" (
  echo.
  echo ERROR: pages:deploy failed exit %ERR%
  pause
  exit /b %ERR%
)

echo.
echo Done: rootrecord-website uploaded.
pause
endlocal
exit /b 0
