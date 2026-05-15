@echo off
setlocal EnableExtensions
rem Build signed Android release for Kilauea Alerts (native Kotlin / Gradle KTS).
rem
rem 0) Mobile\scripts\bump-mobile-version.ps1                                (versionCode +1 in app/build.gradle.kts; versionName PATCH = new versionCode)
rem 1) gradlew bundleRelease assembleRelease                                 (same order as Mobile\scripts\release-bump-and-build.ps1 -App kilauea)
rem 2) copy outputs into Mobile\builds\kilauea-alerts\                      (see Mobile\docs\RELEASE-BUILD-OUTPUTS.md)
rem
rem No cap sync, no web build — pure native Kotlin; bump helper is invoked with -BuildGradle only.
rem Release signing: app/build.gradle.kts release signingConfig + secrets in local.properties
rem   (RELEASE_STORE_*, keystore path under repo per local.properties.example).

set "APP=%~dp0"
set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"
set "GRADLEW=%APP%gradlew.bat"

cd /d "%APP%"

if not exist "%GRADLEW%" (
  echo gradlew.bat not found at: %GRADLEW%
  goto FAIL
)
if not exist "%BUMP%" (
  echo bump-mobile-version.ps1 not found at: %BUMP%
  goto FAIL
)

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
echo [1/2] gradlew bundleRelease assembleRelease
call "%GRADLEW%" bundleRelease assembleRelease
if errorlevel 1 goto FAIL

rem %VER% was set by [0/2] above (bump-mobile-version.ps1 stdout). Artifact names use that string
rem so filenames match versionName written into app/build.gradle.kts.

set "OUT_APK=%~dp0app\build\outputs\apk\release"
set "OUT_AAB=%~dp0app\build\outputs\bundle\release"
set "APK_SRC=%OUT_APK%\app-release.apk"
set "AAB_SRC=%OUT_AAB%\app-release.aab"
if not exist "%APK_SRC%" (
  echo Expected APK not found: %APK_SRC%
  echo If signing failed, look for *unsigned* under: %OUT_APK%
  dir /b "%OUT_APK%" 2>nul
  goto FAIL
)
if not exist "%AAB_SRC%" (
  echo Expected AAB not found: %AAB_SRC%
  dir /b "%OUT_AAB%" 2>nul
  goto FAIL
)

set "DEST=%~dp0..\builds\kilauea-alerts"
if not exist "%DEST%" mkdir "%DEST%"
set "APK_DEST=%DEST%\RootRecord-Kilauea-Alerts-%VER%.apk"
set "AAB_DEST=%DEST%\RootRecord-Kilauea-Alerts-%VER%.aab"
copy /y "%APK_SRC%" "%APK_DEST%" >nul
if errorlevel 1 goto FAIL
copy /y "%AAB_SRC%" "%AAB_DEST%" >nul
if errorlevel 1 goto FAIL

echo.
echo Done.
echo   APK: %APK_DEST%
echo   AAB: %AAB_DEST%
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
