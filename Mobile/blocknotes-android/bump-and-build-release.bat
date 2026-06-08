@echo off
setlocal EnableExtensions
rem Build signed Android release for BlockNotes (native Kotlin / Gradle KTS).
rem
rem Baseline in repo: versionCode 0, versionName 1.0.0
rem First run bumps to versionCode 1, versionName 1.0.1 (Play-ready).
rem
rem 0) Mobile\scripts\bump-mobile-version.ps1                                (versionCode +1; PATCH = new code)
rem 1) gradlew bundleRelease assembleRelease                                 (signed APK + AAB)
rem 2) copy outputs into Mobile\builds\blocknotes\                          (see Mobile\docs\RELEASE-BUILD-OUTPUTS.md)
rem
rem Release signing: app/build.gradle.kts + gitignored local.properties
rem   RELEASE_STORE_FILE=keystore/blocknotes-upload.jks
rem   RELEASE_KEY_ALIAS=blocknotes-upload
rem   RELEASE_STORE_PASSWORD / RELEASE_KEY_PASSWORD
rem
rem Optional API (feedback/auth): cloudflare-update-workers.bat blocknotes

set "APP=%~dp0"
set "APP_Q=%APP%"
if "%APP_Q:~-1%"=="\" set "APP_Q=%APP_Q:~0,-1%"
set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"
set "GRADLEW=%APP%gradlew.bat"
set "LOCAL=%APP%local.properties"
set "KEYSTORE=%APP%keystore\blocknotes-upload.jks"

cd /d "%APP%"

if not exist "%GRADLEW%" (
  echo gradlew.bat not found at: %GRADLEW%
  goto FAIL
)
if not exist "%BUMP%" (
  echo bump-mobile-version.ps1 not found at: %BUMP%
  goto FAIL
)
if not exist "%LOCAL%" (
  echo ERROR: Missing release signing config:
  echo   %LOCAL%
  echo Copy local.properties.example and set RELEASE_STORE_* / RELEASE_KEY_*.
  goto FAIL
)
if not exist "%KEYSTORE%" (
  echo ERROR: Missing upload keystore:
  echo   %KEYSTORE%
  echo Create it once — see README "Play signing".
  goto FAIL
)

echo.
echo === BlockNotes release ===
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
echo [preflight] Stop Gradle daemons and clear stale lint cache
call "%GRADLEW%" --stop >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '%APP%app\build\intermediates\lint-cache' -Recurse -Force -ErrorAction SilentlyContinue"

echo.
echo [1/2] gradlew bundleRelease assembleRelease
call "%GRADLEW%" bundleRelease assembleRelease
if errorlevel 1 goto FAIL

set "DEST=%~dp0..\builds\blocknotes"
echo.
echo [2/2] Stage APK + AAB -^> %DEST%
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%..\scripts\stage-release-artifacts.ps1" -AppDir "%APP_Q%" -DestDir "%DEST%" -BaseName "RootRecord-BlockNotes" -Version "%VER%" -Native
if errorlevel 1 goto FAIL

echo.
echo Done. Upload to Play Console:
echo   %DEST%\RootRecord-BlockNotes-%VER%.aab
echo   %DEST%\RootRecord-BlockNotes-%VER%.apk
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
