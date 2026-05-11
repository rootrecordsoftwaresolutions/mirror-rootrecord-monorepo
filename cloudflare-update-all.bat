@echo off
setlocal EnableExtensions

rem Runs all Cloudflare Workers + Pages deploys for this monorepo.
rem Assumes you have Node, npm, pnpm, and Wrangler auth already set up.

cd /d "%~dp0"

echo.
echo ================================
echo RootRecord Cloudflare - Update All
echo ================================
echo Repo: %CD%
echo.

set "ERR=0"

rem --- Workers (API primary + shards) ---
echo [1/6] Deploy Workers: rootrecord-primary
pushd "Web\cloudflare\rootrecord-primary" || goto FAIL
npm ci || goto FAIL
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %* || goto FAIL
popd

echo [2/6] Deploy Workers: API shards (weather/business/account/token/kilauea)
pushd "Web\cloudflare" || goto FAIL
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-api-shards.ps1" %* || goto FAIL
popd

echo [3/6] Deploy Workers: rootrecord-license
pushd "Web\cloudflare\rootrecord-license" || goto FAIL
npm ci || goto FAIL
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %* || goto FAIL
popd

echo [4/6] Deploy Workers: rootrecord-solana-tx
pushd "Web\cloudflare\rootrecord-solana-tx" || goto FAIL
npm ci || goto FAIL
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %* || goto FAIL
popd

echo [5/6] Deploy Workers: rootrecord-app-build
pushd "Web\cloudflare\rootrecord-app-build" || goto FAIL
npm ci || goto FAIL
npx wrangler deploy %* || goto FAIL
popd

echo [6/6] Deploy Workers: rr-weather-manager-api
pushd "Web\cloudflare\rr-weather-manager-api" || goto FAIL
npm ci || goto FAIL
npx wrangler d1 migrations apply USER_DATA_DB --remote || goto FAIL
npx wrangler deploy %* || goto FAIL
popd

rem --- Pages (marketing + product SPAs) ---
echo.
echo ================================
echo Pages deploys
echo ================================

echo Deploy Pages: rootrecord-website (marketing)
pushd "Web\main" || goto FAIL
npm ci || goto FAIL
npm run pages:deploy --silent || goto FAIL
popd

echo Deploy Pages: product web SPAs (weather/business/account/token/kilauea)
pushd "Mobile" || goto FAIL
pnpm install || goto FAIL
pnpm run pages:deploy:weather || goto FAIL
pnpm run pages:deploy:business || goto FAIL
pnpm run pages:deploy:account || goto FAIL
pnpm run pages:deploy:token || goto FAIL
pnpm run pages:deploy:kilauea || goto FAIL
popd

echo.
echo Done.
pause
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
echo.
echo ERROR: cloudflare-update-all.bat failed with exit code %ERR%.
pause
exit /b %ERR%
