@echo off
setlocal EnableExtensions
rem Build signed Android release for Business Manager.
rem
rem Self-contained. Bumps the patch version, runs the web build, runs cap sync, runs gradle.
rem
rem 0) version-bump.ps1                                                   (PATCH +1 across wrapper package.json, web package.json, build.gradle)
rem 1) pnpm install + pnpm run build in Web\apps\business-manager-web    (produces the bundled web assets)
rem 2) pnpm install + cap sync android   in Mobile\business-manager-app  (copies them into Android assets)
rem 3) gradlew assembleRelease bundleRelease in android\                 (signed APK + AAB)
rem 4) copy APK + AAB into Mobile\builds\business-manager\

set "APP=%~dp0"
set "WEB=%APP%..\..\Web\apps\business-manager-web"
set "ANDROID=%APP%android"
set "DEST=%APP%..\builds\business-manager"
set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"

cd /d "%APP%"

echo.
echo === Business Manager release ===
echo.
echo [0/4] Version bump (patch +1)
rem The shared bump-mobile-version.ps1 prints diagnostics to stderr (Write-Host) and the new
rem version to stdout (Write-Output). We capture only stdout so %VER% is e.g. "1.0.17".
set "VER="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BUMP%" -WrapperPackageJson "%APP%package.json" -WebPackageJson "%WEB%\package.json" -BuildGradle "%ANDROID%\app\build.gradle"`) do set "VER=%%V"
if not defined VER (
  echo bump-mobile-version.ps1 produced no output - aborting.
  goto FAIL
)
echo Building v%VER%

echo.
echo [1/4] Web build (Web\apps\business-manager-web)
pushd "%WEB%"
if errorlevel 1 goto FAIL
call pnpm install
if errorlevel 1 ( popd & goto FAIL )
set "GENERATE_SOURCEMAP=false"
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

rem %VER% was set by [0/4] above (version-bump.ps1 output). No re-read here — we want the artifact
rem filename to match exactly what was written into the JSON + gradle files for this build.

if not exist "%DEST%" mkdir "%DEST%"
copy /y "%ANDROID%\app\build\outputs\apk\release\app-release.apk" "%DEST%\RootRecord-BusinessManager-%VER%.apk" >nul
copy /y "%ANDROID%\app\build\outputs\bundle\release\app-release.aab" "%DEST%\RootRecord-BusinessManager-%VER%.aab" >nul

echo.
echo Done.
echo   APK: %DEST%\RootRecord-BusinessManager-%VER%.apk
echo   AAB: %DEST%\RootRecord-BusinessManager-%VER%.aab
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
