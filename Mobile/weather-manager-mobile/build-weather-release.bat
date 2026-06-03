@echo off
setlocal EnableExtensions EnableDelayedExpansion
if defined RR_WEATHER_RELEASE_LOGGING goto RUN_RELEASE
set "APP=%~dp0"
set "LOGDIR=%APP%release-logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "STAMP=%%T"
set "LOG=%LOGDIR%\weather-build-release-%STAMP%.log"
echo === Weather Manager release ===
echo Logging full output to:
echo   %LOG%
echo.
set "RR_WEATHER_RELEASE_LOGGING=1"
call "%~f0" %* > "%LOG%" 2>&1
set "ERR=%ERRORLEVEL%"
echo.
echo ============================================================
echo Weather release finished with exit code: %ERR%
echo Full log saved to:
echo   %LOG%
echo ============================================================
pause
endlocal
exit /b %ERR%

:RUN_RELEASE

rem RootRecord Weather — build signed release APK + Play bundle (AAB).
rem Web source lives at ..\..\Web\apps\weather-manager-web ; this app dir holds capacitor.config.json + android\.
set "APP=%~dp0"
set "WEB=%APP%..\..\Web\apps\weather-manager-web"
set "ANDROID=%APP%android"
set "KEYSTORE=%ANDROID%\app\keystore\keystore.properties"
set "GJSON=%ANDROID%\app\google-services.json"
set "RELEASE_DIR=%APP%release"
set "BUILDS_DIR=%APP%..\builds\weather-manager"
rem Default Gradle output names — the rename in app/build.gradle was dropped because the
rem `applicationVariants.configureEach { output.outputFileName = ... }` hook silently no-ops
rem on some AGP versions, leaving only the AAB produced. We rename on copy at the bottom
rem of this script instead, which is AGP-version-proof.
set "APK_SRC=%ANDROID%\app\build\outputs\apk\release\app-release.apk"
set "BUNDLE_SRC=%ANDROID%\app\build\outputs\bundle\release\app-release.aab"

if not exist "%WEB%\package.json" (
  echo ERROR: web source not found at "%WEB%"
  exit /b 1
)
if not exist "%KEYSTORE%" (
  echo ERROR: Missing signing config:
  echo   %KEYSTORE%
  exit /b 1
)
if not exist "%GJSON%" (
  echo ERROR: Missing Firebase config:
  echo   %GJSON%
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm is not on PATH. Install pnpm or add it to PATH.
  exit /b 1
)

pushd "%WEB%" || exit /b 1
echo [1/4] Building web assets...
call pnpm install
if errorlevel 1 goto :fail
call pnpm run build
if errorlevel 1 goto :fail
popd

pushd "%APP%" || exit /b 1
echo [2/4] Syncing Capacitor Android...
call pnpm install
if errorlevel 1 goto :fail
call pnpm exec cap sync android
if errorlevel 1 goto :fail

pushd "%ANDROID%" || goto :fail
echo [3/4] Gradle: assembleRelease + bundleRelease...
call gradlew.bat assembleRelease bundleRelease
if errorlevel 1 goto :fail_pop2
popd
popd

if not exist "%APK_SRC%" (
  echo ERROR: Expected APK not found:
  echo   %APK_SRC%
  exit /b 1
)
if not exist "%BUNDLE_SRC%" (
  echo ERROR: Expected AAB not found:
  echo   %BUNDLE_SRC%
  exit /b 1
)

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$pkg = Get-Content -LiteralPath '%APP%package.json' -Raw; (ConvertFrom-Json $pkg).version"`) do set "VER=%%V"
if not defined VER set "VER=0.0.0"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"`) do set "STAMP=%%T"

set "APK_DEST=%RELEASE_DIR%\RootRecord-Weather.apk"
set "AAB_DEST=%RELEASE_DIR%\RootRecord-Weather-v!VER!-!STAMP!.aab"
set "BUILDS_APK_DEST=%BUILDS_DIR%\RootRecord-WeatherManager-!VER!.apk"
set "BUILDS_AAB_DEST=%BUILDS_DIR%\RootRecord-WeatherManager-!VER!.aab"

copy /Y "%APK_SRC%" "%APK_DEST%" >nul
copy /Y "%BUNDLE_SRC%" "%AAB_DEST%" >nul
if not exist "%BUILDS_DIR%" mkdir "%BUILDS_DIR%"
copy /Y "%APK_SRC%" "%BUILDS_APK_DEST%" >nul
copy /Y "%BUNDLE_SRC%" "%BUILDS_AAB_DEST%" >nul

echo.
echo Done.
echo   APK:  %APK_DEST%
echo   AAB:  %AAB_DEST%
echo   Builds APK:  %BUILDS_APK_DEST%
echo   Builds AAB:  %BUILDS_AAB_DEST%
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -LiteralPath '%APK_DEST%' -Algorithm SHA256).Hash"`) do echo   SHA256 ^(APK^):  %%H
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -LiteralPath '%AAB_DEST%' -Algorithm SHA256).Hash"`) do echo   SHA256 ^(AAB^): %%H
exit /b 0

:fail_pop2
popd
:fail
popd
echo Build failed.
exit /b 1
