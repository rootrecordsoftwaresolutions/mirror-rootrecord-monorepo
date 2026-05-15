@echo off
setlocal EnableExtensions

rem Deploy ONLY the marketing website Cloudflare Pages project (Web\main).
rem Does not touch Workers or per-product web apps.
rem Uses Web\main\pages-deploy.ps1 which loads credentials.env by walking parents.

cd /d "%~dp0"

echo.
echo ================================
echo RootRecord Cloudflare - Pages: website (Web\main)
echo ================================
echo Repo: %CD%
echo.

pushd "Web\main"
if errorlevel 1 goto FAIL

call npm ci
if errorlevel 1 ( popd & goto FAIL )

call npm run pages:deploy --silent
if errorlevel 1 ( popd & goto FAIL )

popd

echo.
echo Website Pages deploy done.
pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: cloudflare-update-website.bat failed.
echo Exit code:  %ERR%
echo CWD:        %CD%
echo ============================================================
pause
endlocal
exit /b %ERR%

