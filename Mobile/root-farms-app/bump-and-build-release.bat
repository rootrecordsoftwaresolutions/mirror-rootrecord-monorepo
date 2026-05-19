@echo off

setlocal EnableExtensions

rem Root Farms: bump patch, web build, cap sync, release APK + AAB -> Mobile\builds\root-farms\

rem Signing: android\keystore.properties + android\upload-release.jks



set "APP=%~dp0"

set "APP_Q=%APP%"

if "%APP_Q:~-1%"=="\" set "APP_Q=%APP_Q:~0,-1%"

set "WEB=%APP%..\..\Web\apps\root-farms-mobile-web"

set "ANDROID=%APP%android"

set "DEST=%APP%..\builds\root-farms"

set "BUMP=%APP%..\scripts\bump-mobile-version.ps1"



cd /d "%APP%"



echo.

echo === Root Farms release ===

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

echo [1/4] Mobile web build (Web\apps\root-farms-mobile-web)

pushd "%WEB%"

if errorlevel 1 goto FAIL

call pnpm install

if errorlevel 1 ( popd & goto FAIL )

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



echo.

echo [4/4] Stage APK + AAB -^> %DEST%

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%..\scripts\stage-release-artifacts.ps1" -AppDir "%APP_Q%" -DestDir "%DEST%" -BaseName "RootRecord-RootFarms" -Version "%VER%"

if errorlevel 1 goto FAIL



echo.

echo Done. See %DEST% for RootRecord-RootFarms-%VER%.apk and .aab

pause

endlocal

exit /b 0



:FAIL

set "ERR=%ERRORLEVEL%"

if "%ERR%"=="0" set "ERR=1"

echo BUILD FAILED. Exit code: %ERR%

pause

endlocal

exit /b %ERR%

