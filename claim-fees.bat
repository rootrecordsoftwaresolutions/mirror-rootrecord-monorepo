@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "MODE=%~1"
set "SWEEP_SCRIPT=Web\cloudflare\rootrecord-api-account\scripts\sweep-custodial-sol.ps1"

if not exist "%SWEEP_SCRIPT%" (
  echo ERROR: Missing %SWEEP_SCRIPT%
  pause
  endlocal
  exit /b 1
)

echo.
echo RootRecord custodial SOL fee sweep
echo ----------------------------------
echo Default mode is LIVE. Use DRY to preview without moving SOL.
echo.

if /I "%MODE%"=="DRY" goto DRY
goto LIVE

:DRY
echo Running dry run preview...
echo To move SOL to treasury, run: claim-fees.bat
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SWEEP_SCRIPT%"
if errorlevel 1 goto ERR
goto DONE

:LIVE
echo WARNING: LIVE mode will send native SOL from all custodial wallets to treasury.
echo This uses the treasury as fee payer and can drain custodial wallets to 0 lamports.
echo.
set /p "CONFIRM=Type CLAIM FEES to continue: "
if /I not "%CONFIRM%"=="CLAIM FEES" (
  echo Canceled.
  endlocal
  exit /b 0
)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SWEEP_SCRIPT%" -Live
if errorlevel 1 goto ERR
goto DONE

:ERR
echo.
echo ERROR: claim fees failed. Review the output above.
pause
endlocal
exit /b 1

:DONE
echo.
echo Done.
pause
endlocal
exit /b 0
