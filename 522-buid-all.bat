@echo off
setlocal EnableExtensions

rem 2026-05-22 mobile release build wrapper.
rem Builds current-version APK/AAB artifacts for all RootRecord mobile apps.
rem Output: Mobile\builds\<app>\*.apk and *.aab
rem
rem Usage:
rem   522-buid-all.bat
rem   522-buid-all.bat nopause

cd /d "%~dp0"

set "NOPAUSE=0"
if /I "%~1"=="nopause" set "NOPAUSE=1"

set "GENERATE_SOURCEMAP=false"
if "%NODE_OPTIONS%"=="" set "NODE_OPTIONS=--max-old-space-size=8192 --max-semi-space-size=128"

set "LOGFILE=%~dp0522-buid-all.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

echo.
echo ================================
echo RootRecord - 5/22 mobile builds
echo ================================
echo Repo: %CD%
echo Output: Mobile\builds
echo.

set "STEP=Mobile\scripts\build-all-release-to-builds.ps1"
echo [%STEP%]
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Continue'; if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) { $PSNativeCommandUseErrorActionPreference=$false }; try { & '%~dp0Mobile\scripts\build-all-release-to-builds.ps1' *>&1 | Tee-Object -FilePath '%LOGFILE%' -Append; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } catch { $_ | Tee-Object -FilePath '%LOGFILE%' -Append; exit 1 }"
if errorlevel 1 goto FAIL

echo.
echo 5/22 mobile release builds finished OK.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: 522-buid-all.bat failed.
echo Step:      %STEP%
echo Exit code: %ERR%
echo Log:       %LOGFILE%
echo ============================================================
echo FAILED at %STEP% exit %ERR% >> "%LOGFILE%"
if not "%NOPAUSE%"=="1" pause
endlocal
exit /b %ERR%
