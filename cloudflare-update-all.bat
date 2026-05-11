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

rem --- Workers (API primary + shards) ---
echo [1/6] Deploy Workers: rootrecord-primary
pushd "Web\cloudflare\rootrecord-primary" || exit /b 1
if not exist "node_modules" npm ci || (popd & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %* || (popd & exit /b 1)
popd

echo [2/6] Deploy Workers: API shards (weather/business/account/token/kilauea)
pushd "Web\cloudflare" || exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-api-shards.ps1" %* || (popd & exit /b 1)
popd

echo [3/6] Deploy Workers: rootrecord-license
pushd "Web\cloudflare\rootrecord-license" || exit /b 1
if not exist "node_modules" npm ci || (popd & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %* || (popd & exit /b 1)
popd

echo [4/6] Deploy Workers: rootrecord-solana-tx
pushd "Web\cloudflare\rootrecord-solana-tx" || exit /b 1
if not exist "node_modules" npm ci || (popd & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1" %* || (popd & exit /b 1)
popd

echo [5/6] Deploy Workers: rootrecord-app-build
pushd "Web\cloudflare\rootrecord-app-build" || exit /b 1
if not exist "node_modules" npm ci || (popd & exit /b 1)
npx wrangler deploy %* || (popd & exit /b 1)
popd

echo [6/6] Deploy Workers: rr-weather-manager-api
pushd "Web\cloudflare\rr-weather-manager-api" || exit /b 1
if not exist "node_modules" npm ci || (popd & exit /b 1)
npx wrangler d1 migrations apply USER_DATA_DB --remote || (popd & exit /b 1)
npx wrangler deploy %* || (popd & exit /b 1)
popd

rem --- Pages (marketing + product SPAs) ---
echo.
echo ================================
echo Pages deploys
echo ================================

echo Deploy Pages: rootrecord-website (marketing)
pushd "Web\main" || exit /b 1
if not exist "node_modules" npm ci || (popd & exit /b 1)
npm run pages:deploy --silent || (popd & exit /b 1)
popd

echo Deploy Pages: product web SPAs (weather/business/account/token/kilauea)
pushd "Mobile" || exit /b 1
pnpm install || (popd & exit /b 1)
pnpm run pages:deploy:weather || (popd & exit /b 1)
pnpm run pages:deploy:business || (popd & exit /b 1)
pnpm run pages:deploy:account || (popd & exit /b 1)
pnpm run pages:deploy:token || (popd & exit /b 1)
pnpm run pages:deploy:kilauea || (popd & exit /b 1)
popd

echo.
echo Done.
exit /b 0
