@echo off
setlocal EnableExtensions
rem Bump versionCode/versionName by one, rebuild web + Capacitor + signed Android release,
rem and stage APK + AAB into Mobile\builds\account-hub\.
rem Implementation: Mobile\scripts\release-bump-and-build.ps1

cd /d "%~dp0..\scripts"
set "LOGFILE=%~dp0bump-and-build-release.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"

powershell -NoProfile -ExecutionPolicy Bypass -File "release-bump-and-build.ps1" -App account
set "ERR=%ERRORLEVEL%"

echo Finished with exit %ERR% %DATE% %TIME% >> "%LOGFILE%"
echo.
if "%ERR%"=="0" (
  echo Done. Exit 0.
) else (
  echo ============================================================
  echo ERROR: bump-and-build-release.bat (account) failed.
  echo Exit code: %ERR%
  echo Log:       %LOGFILE%
  echo ============================================================
)
pause
endlocal
exit /b %ERR%
