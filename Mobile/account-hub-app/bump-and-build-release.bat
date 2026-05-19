@echo off
setlocal EnableExtensions
rem Build signed Android release for Account Hub.
rem
rem 0) Mobile\scripts\bump-mobile-version.ps1                       (PATCH +1 across wrapper package.json, web package.json, build.gradle)
rem 1) pnpm install + pnpm run build in Web\apps\account-hub-web    (produces the bundled web assets)
rem 2) pnpm install + cap sync android in Mobile\account-hub-app    (copies them into Android assets)
rem 3) gradlew assembleRelease bundleRelease in android\            (signed APK + AAB)
rem 4) copy APK + AAB into Mobile\builds\account-hub\

set "APP=%~dp0"
set "APP_Q=%APP%"
if "%APP_Q:~-1%"=="\" set "APP_Q=%APP_Q:~0,-1%"
set "WEB=%APP%..\..\Web\apps\account-hub-web"
set "ANDROID=%APP%android"
set "DEST=%APP%..\builds\account-hub"
set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"

cd /d "%APP%"

echo.
echo === Account Hub release ===
echo.
echo [0/4] Version bump (patch +1)
rem Shared helper: bumps versionCode in build.gradle and mirrors versionName into both
rem package.json files. Diagnostics go to stderr; stdout is just the new version string.
set "VER="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BUMP%" -WrapperPackageJson "%APP%package.json" -WebPackageJson "%WEB%\package.json" -BuildGradle "%ANDROID%\app\build.gradle"`) do set "VER=%%V"
if not defined VER (
  echo bump-mobile-version.ps1 produced no output - aborting.
  goto FAIL
)
echo Building v%VER%

echo.
echo [1/4] Web build (Web\apps\account-hub-web)
pushd "%WEB%"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
set "GENERATE_SOURCEMAP=false"
set "NODE_OPTIONS=--max-old-space-size=8192 --max-semi-space-size=128"
call pnpm run build
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo [2/4] cap sync android
call pnpm install
if errorlevel 1 goto FAIL
call pnpm exec cap sync android
if errorlevel 1 goto FAIL

echo.
echo [3/4] gradlew assembleRelease bundleRelease
pushd "%ANDROID%"
if errorlevel 1 goto FAIL
call gradlew.bat assembleRelease bundleRelease
if errorlevel 1 ( popd & goto FAIL )
popd

rem %VER% was set by [0/4] above (bump-mobile-version.ps1 output). No re-read here — we want
rem the artifact filename to match exactly what was written into the JSON + gradle files.

echo.
echo [5/5] Stage APK + AAB -^> %DEST%
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%..\scripts\stage-release-artifacts.ps1" -AppDir "%APP_Q%" -DestDir "%DEST%" -BaseName "RootRecord-AccountHub" -Version "%VER%"
if errorlevel 1 goto FAIL

echo.
echo Done. See %DEST% for RootRecord-AccountHub-%VER%.apk and .aab
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
