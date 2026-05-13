@echo off
setlocal EnableExtensions

rem Deletes the rootrecord-primary Worker from Cloudflare.
rem
rem Why: rootrecord-primary has been in "slow phase-out" mode since the per-app API shards
rem (rootrecord-api-weather/business/account/token/kilauea) shipped. Its deployed code still
rem contains the legacy weather/forecast logic AND a `*/5 * * * *` cron firing the same NOAA
rem poller that api-weather now owns -- i.e. real double-calls until the Worker is deleted.
rem
rem This script does NOT delete the source directory `Web/cloudflare/rootrecord-primary/` --
rem that stays in the repo as historical reference / fallback recipe. It only removes the
rem deployed Worker (and its crons) from Cloudflare.
rem
rem Side effects to confirm before running:
rem   1. `45 8 * * *` inactive-account cleanup currently runs ONLY on primary. After deletion
rem      it stops running until you register `crons = ["45 8 * * *"]` on rootrecord-api-account
rem      (and wire its scheduled() handler to call runInactiveAccountCleanupCron).
rem   2. Routes still bound to `rootrecord-primary` in Cloudflare (e.g., `api.rootrecord.info/*`
rem      catch-all) will start returning 404 / 530 unless re-bound to another Worker first.
rem      Check: Cloudflare dashboard > Workers & Pages > rootrecord-primary > Triggers > Routes.
rem
rem Run order (manual):
rem   - Re-bind any `rootrecord-primary` routes to a surviving shard (or accept the 404s).
rem   - Move the `45 8` cleanup cron to api-account (see Web/cloudflare/rootrecord-api-account
rem     wrangler.toml + src/index.ts) if you still want it.
rem   - Run this script.

cd /d "%~dp0"

set "LOGFILE=%~dp0cloudflare-delete-primary.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"

echo.
echo ============================================================
echo DESTRUCTIVE: delete Cloudflare Worker `rootrecord-primary`
echo ============================================================
echo This will:
echo   - Tear down the deployed Worker and all its cron triggers
echo   - Stop the legacy `*/5` NOAA poller and `45 8` cleanup cron
echo   - Leave repo source at Web\cloudflare\rootrecord-primary\ untouched
echo.
set /p CONFIRM=Type DELETE to proceed: 
if /I not "%CONFIRM%"=="DELETE" (
  echo Aborted.
  pause
  endlocal
  exit /b 1
)

pushd "Web\cloudflare\rootrecord-primary"
if errorlevel 1 goto FAIL
call npx wrangler delete --name rootrecord-primary
if errorlevel 1 ( popd & goto FAIL )
popd

echo.
echo Worker deleted. Verify in Cloudflare dashboard.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
pause
endlocal
exit /b 0

:FAIL
echo.
echo ============================================================
echo ERROR: cloudflare-delete-primary.bat failed.
echo ============================================================
echo FAILED >> "%LOGFILE%"
pause
endlocal
exit /b 1
