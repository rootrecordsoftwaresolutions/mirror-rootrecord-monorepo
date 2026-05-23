@echo off
setlocal EnableExtensions

rem Build ALL product web apps (pnpm) then ALL Android release APK/AAB into Mobile\builds\.
rem Requires: Node, pnpm, JDK, Android SDK (ANDROID_HOME), signing keystores where configured.
rem
rem Usage:
rem   Single-build-all.bat              - web builds, then Mobile release script
rem   Single-build-all.bat nopause      - exit when done (no final pause)
rem   Single-build-all.bat webonly      - web builds only (no Gradle / APK)
rem   Single-build-all.bat mobileonly   - Mobile\scripts\build-all-release-to-builds.ps1 only
rem
rem Web\main (marketing) is static — no compile step. Skips rootrecord-primary / solana site.

cd /d "%~dp0"

set "MODE=all"
set "NOPAUSE=0"
if /I "%~1"=="nopause" set "NOPAUSE=1"
if /I "%~1"=="webonly" set "MODE=web"
if /I "%~2"=="nopause" set "NOPAUSE=1"
if /I "%~1"=="mobileonly" set "MODE=mobile"
if /I "%~2"=="nopause" if /I "%~1"=="mobileonly" set "NOPAUSE=1"

set "GENERATE_SOURCEMAP=false"
if "%NODE_OPTIONS%"=="" set "NODE_OPTIONS=--max-old-space-size=8192 --max-semi-space-size=128"

set "LOGFILE=%~dp0Single-build-all.log"
echo Starting %DATE% %TIME% mode=%MODE% > "%LOGFILE%"

echo.
echo ================================
echo RootRecord — build ALL
echo Mode: %MODE%
echo ================================
echo Repo: %CD%
echo Log:  %LOGFILE%
echo.

if /I not "%MODE%"=="mobile" goto BUILD_WEB
goto BUILD_MOBILE

:BUILD_WEB
set "STEP=init"
set "ERR=0"

set "STEP=[web 1/7] Web\apps\weather-manager-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\weather-manager-web"
if errorlevel 1 goto FAIL

set "STEP=[web 2/7] Web\apps\business-manager-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\business-manager-web"
if errorlevel 1 goto FAIL

set "STEP=[web 3/7] Web\apps\account-hub-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\account-hub-web"
if errorlevel 1 goto FAIL

set "STEP=[web 4/7] Web\apps\token-manager-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\token-manager-web"
if errorlevel 1 goto FAIL

set "STEP=[web 5/7] Web\apps\kilauea-alerts-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\kilauea-alerts-web"
if errorlevel 1 goto FAIL

set "STEP=[web 6/7] Web\apps\root-farms-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\root-farms-web"
if errorlevel 1 goto FAIL

set "STEP=[web 7/7] Web\apps\root-farms-mobile-web"
echo %STEP%
call :BuildPnpmWeb "Web\apps\root-farms-mobile-web"
if errorlevel 1 goto FAIL

echo.
echo Web builds done.
echo Web builds done. >> "%LOGFILE%"

if /I "%MODE%"=="web" goto DONE

:BUILD_MOBILE
set "STEP=Mobile\scripts\build-all-release-to-builds.ps1"
echo.
echo %STEP%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Mobile\scripts\build-all-release-to-builds.ps1"
if errorlevel 1 goto FAIL

goto DONE

:BuildPnpmWeb
pushd "%~dp0%~1"
if errorlevel 1 exit /b 1
call pnpm install
if errorlevel 1 ( popd & exit /b 1 )
call pnpm run build
if errorlevel 1 ( popd & exit /b 1 )
popd
exit /b 0

:DONE
echo.
echo All requested builds finished OK.
echo Output APK/AAB: Mobile\builds\  (when mobile stage ran)
echo Finished %DATE% %TIME% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: Single-build-all.bat failed.
echo Step:      %STEP%
echo Exit code: %ERR%
echo Log:       %LOGFILE%
echo ============================================================
echo FAILED at %STEP% exit %ERR% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b %ERR%
