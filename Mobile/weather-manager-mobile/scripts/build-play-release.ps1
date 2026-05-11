$ErrorActionPreference = "Stop"

$appRoot     = Split-Path -Parent $PSScriptRoot
$webRoot     = Resolve-Path (Join-Path $appRoot "..\..\Web\apps\weather-manager-web")
$androidRoot = Join-Path $appRoot "android"
$releaseDir  = Join-Path $appRoot "release"
$bundlePath  = Join-Path $androidRoot "app\build\outputs\bundle\release\app-release.aab"
$keystorePropsPath  = Join-Path $androidRoot "app\keystore\keystore.properties"
$googleServicesPath = Join-Path $androidRoot "app\google-services.json"

Write-Host "Preparing Google Play upload bundle..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $keystorePropsPath)) {
  throw "Missing signing config: $keystorePropsPath"
}
if (-not (Test-Path -LiteralPath $googleServicesPath)) {
  throw "Missing Firebase config: $googleServicesPath"
}

Write-Host "Step 1/3: Building web assets at $webRoot ..." -ForegroundColor Yellow
Push-Location $webRoot
try {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm install
    pnpm run build
  } else {
    npm install --legacy-peer-deps
    npm run build
  }
} finally {
  Pop-Location
}

Push-Location $appRoot
try {
  Write-Host "Step 2/3: Syncing Capacitor Android project..." -ForegroundColor Yellow
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm install
    pnpm exec cap sync android
  } else {
    npm install
    npx cap sync android
  }

  Write-Host "Step 3/3: Building signed Android App Bundle (.aab)..." -ForegroundColor Yellow
  Push-Location $androidRoot
  try {
    .\gradlew.bat bundleRelease
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $bundlePath)) {
    throw "Expected AAB not found at: $bundlePath"
  }

  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
  $pkg = Get-Content -LiteralPath (Join-Path $appRoot "package.json") -Raw | ConvertFrom-Json
  $ver = [string]$pkg.version
  if (-not $ver) { $ver = "0.0.0" }
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $dest = Join-Path $releaseDir ("RootRecord-Weather-v{0}-{1}.aab" -f $ver, $stamp)
  Copy-Item -LiteralPath $bundlePath -Destination $dest -Force

  $hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
  Write-Host ""
  Write-Host "Google Play bundle ready:" -ForegroundColor Green
  Write-Host "  $dest"
  Write-Host "SHA256:"
  Write-Host "  $hash"
} finally {
  Pop-Location
}
