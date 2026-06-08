@echo off
setlocal EnableExtensions
rem Build signed Android release for Root Goals.
rem
rem 0) Mobile\scripts\bump-mobile-version.ps1
rem 1) pnpm install + pnpm run build in Web\apps\root-goals-web
rem 2) pnpm install + cap sync android in Mobile\root-goals-mobile
rem 3) gradlew assembleRelease bundleRelease
rem 4) copy APK + AAB into Mobile\builds\root-goals\

set "APP=%~dp0"
set "APP_Q=%APP%"
if "%APP_Q:~-1%"=="\" set "APP_Q=%APP_Q:~0,-1%"
set "WEB=%APP%..\..\Web\apps\root-goals-web"
set "ANDROID=%APP%android"
set "DEST=%APP%..\builds\root-goals"
set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"
set "KEYSTORE=%ANDROID%\upload-release.jks"
set "KEYPROPS=%ANDROID%\keystore.properties"

cd /d "%APP%"

if not exist "%KEYPROPS%" (
  echo ERROR: Missing release signing config:
  echo   %KEYPROPS%
  echo Copy keystore.properties.example to keystore.properties and add upload-release.jks
  echo See README "Play signing" — same upload key pattern as Business Manager.
  goto FAIL
)
if not exist "%KEYSTORE%" (
  echo ERROR: Missing upload keystore:
  echo   %KEYSTORE%
  goto FAIL
)

echo.
echo === Root Goals release ===
echo.
echo [0/4] Version bump (patch +1)
set "VER="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BUMP%" -WrapperPackageJson "%APP%package.json" -WebPackageJson "%WEB%\package.json" -BuildGradle "%ANDROID%\app\build.gradle"`) do set "VER=%%V"
if not defined VER (
  echo bump-mobile-version.ps1 produced no output - aborting.
  goto FAIL
)
echo Building v%VER%

echo.
echo [1/4] Web build (Web\apps\root-goals-web)
pushd "%WEB%"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
set "GENERATE_SOURCEMAP=false"
set "VITE_GOALS_API_BASE=https://api-goals.rootrecord.info/api"
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
echo [2b/4] Ensure Android SDK (local.properties)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$lp='%ANDROID%\local.properties'; if (-not (Test-Path -LiteralPath $lp)) { $sdk=[string]$env:ANDROID_HOME; if (-not $sdk) { $sdk=[string]$env:ANDROID_SDK_ROOT }; if (-not $sdk -and (Test-Path 'C:\Android\Sdk')) { $sdk='C:\Android\Sdk' }; if (-not $sdk) { $sdk=Join-Path $env:LOCALAPPDATA 'Android\Sdk' }; if (-not (Test-Path -LiteralPath $sdk)) { Write-Error 'Android SDK not found. Set ANDROID_HOME or create android\local.properties with sdk.dir='; exit 1 }; $esc=$sdk -replace '\\','\\\\'; Set-Content -LiteralPath $lp -Value ('sdk.dir=' + $esc) -NoNewline; Write-Host ('Created ' + $lp + ' -> ' + $sdk) }"
if errorlevel 1 goto FAIL

echo.
echo [3/4] gradlew assembleRelease bundleRelease
pushd "%ANDROID%"
if errorlevel 1 goto FAIL
call gradlew.bat assembleRelease bundleRelease
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo [4/4] Stage APK + AAB -^> %DEST%
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%..\scripts\stage-release-artifacts.ps1" -AppDir "%APP_Q%" -DestDir "%DEST%" -BaseName "RootRecord-RootGoals" -Version "%VER%"
if errorlevel 1 goto FAIL

echo.
echo Done. See %DEST% for RootRecord-RootGoals-%VER%.apk and .aab
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
