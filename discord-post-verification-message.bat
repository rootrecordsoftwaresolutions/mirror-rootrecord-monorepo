@echo off
setlocal EnableExtensions

rem Post the RootRecord verification instructions into a Discord channel.
rem Requires DISCORD_BOT_TOKEN in repo-root credentials.env.
rem Usage:
rem   discord-post-verification-message.bat <welcomeChannelId>

cd /d "%~dp0"

set "CHAN=%~1"
if "%CHAN%"=="" (
  echo Usage: discord-post-verification-message.bat ^<welcomeChannelId^>
  echo Example: discord-post-verification-message.bat 123456789012345678
  pause
  exit /b 1
)

pushd "Web\cloudflare\rootrecord-api-account"
if errorlevel 1 goto FAIL

node scripts\discord-post-verify-message.mjs --channel "%CHAN%"
if errorlevel 1 ( popd & goto FAIL )

popd
echo.
echo Done.
pause
exit /b 0

:FAIL
echo.
echo Failed.
pause
exit /b 1

