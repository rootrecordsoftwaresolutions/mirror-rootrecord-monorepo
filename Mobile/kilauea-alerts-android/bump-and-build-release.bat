@echo off
setlocal EnableExtensions
rem Build signed Android release for Kilauea Alerts (native Kotlin / Gradle KTS).
rem
rem 0) Mobile\scripts\bump-mobile-version.ps1                                (versionCode +1 in app/build.gradle.kts; PATCH of versionName = new versionCode)
rem 1) gradlew assembleRelease bundleRelease                                 (produces signed APK + AAB)
rem 2) copy outputs into Mobile\builds\kilauea-alerts\
rem
rem No cap sync, no web build — this app is pure native Kotlin so the bump helper is invoked
rem without -WrapperPackageJson / -WebPackageJson and only edits app/build.gradle.kts.

set "APP=%~dp0"
set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"

cd /d "%APP%"

echo.
echo === Kilauea Alerts release ===
echo.
echo [0/2] Version bump (versionCode +1)
set "VER="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BUMP%" -BuildGradle "%APP%app\build.gradle.kts"`) do set "VER=%%V"
if not defined VER (
  echo bump-mobile-version.ps1 produced no output - aborting.
  goto FAIL
)
echo Building v%VER%

echo.
echo [1/2] gradlew assembleRelease bundleRelease
call gradlew.bat assembleRelease bundleRelease
if errorlevel 1 goto FAIL

rem %VER% was set by [0/2] above (bump-mobile-version.ps1 output). No re-read here — we want
rem the artifact filename to match exactly what was written into build.gradle.kts.

set "APK_SRC=%~dp0app\build\outputs\apk\release\app-release.apk"
set "AAB_SRC=%~dp0app\build\outputs\bundle\release\app-release.aab"
set "DEST=%~dp0..\builds\kilauea-alerts"
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%APK_SRC%" "%DEST%\RootRecord-Kilauea-Alerts-%VER%.apk" >nul
copy /y "%AAB_SRC%" "%DEST%\RootRecord-Kilauea-Alerts-%VER%.aab" >nul

echo.
echo Done.
echo   APK: %DEST%\RootRecord-Kilauea-Alerts-%VER%.apk
echo   AAB: %DEST%\RootRecord-Kilauea-Alerts-%VER%.aab
pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo BUILD FAILED. Exit code: %ERR%
echo ============================================================
pause
endlocal
exit /b %ERR%
