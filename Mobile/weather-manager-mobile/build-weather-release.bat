@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem RootRecord Weather — build signed release APK + Play bundle (AAB).
rem Run from anywhere; paths are relative to this script's folder.
set "ROOT=%~dp0"
set "FRONTEND=%ROOT%frontend"
set "ANDROID=%FRONTEND%\android"
set "KEYSTORE=%ANDROID%\app\keystore\keystore.properties"
set "GJSON=%ANDROID%\app\google-services.json"
set "RELEASE_DIR=%FRONTEND%\release"
set "APK_SRC=%ANDROID%\app\build\outputs\apk\release\RootRecord-Weather-release.apk"
set "BUNDLE_SRC=%ANDROID%\app\build\outputs\bundle\release\app-release.aab"

if not exist "%FRONTEND%\package.json" (
  echo ERROR: frontend not found at "%FRONTEND%"
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

pushd "%FRONTEND%" || exit /b 1
echo [1/4] Building web assets...
call pnpm run build
if errorlevel 1 goto :fail

echo [2/4] Syncing Capacitor Android...
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

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -LiteralPath '%FRONTEND%\package.json' -Raw ^| ConvertFrom-Json).version"`) do set "VER=%%V"
if not defined VER set "VER=0.0.0"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"`) do set "STAMP=%%T"

set "APK_DEST=%RELEASE_DIR%\RootRecord-Weather.apk"
set "AAB_DEST=%RELEASE_DIR%\RootRecord-Weather-v!VER!-!STAMP!.aab"

copy /Y "%APK_SRC%" "%APK_DEST%" >nul
copy /Y "%BUNDLE_SRC%" "%AAB_DEST%" >nul

echo.
echo Done.
echo   APK:  %APK_DEST%
echo   AAB:  %AAB_DEST%
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -LiteralPath '%APK_DEST%' -Algorithm SHA256).Hash"`) do echo   SHA256 ^(APK^):  %%H
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -LiteralPath '%AAB_DEST%' -Algorithm SHA256).Hash"`) do echo   SHA256 ^(AAB^): %%H
exit /b 0

:fail_pop2
popd
:fail
popd
echo Build failed.
exit /b 1
