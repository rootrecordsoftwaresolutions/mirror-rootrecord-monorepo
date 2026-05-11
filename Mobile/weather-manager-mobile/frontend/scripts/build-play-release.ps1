$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $frontendRoot "android"
$releaseDir = Join-Path $frontendRoot "release"
$bundlePath = Join-Path $androidRoot "app\build\outputs\bundle\release\app-release.aab"
$keystorePropsPath = Join-Path $androidRoot "app\keystore\keystore.properties"
$googleServicesPath = Join-Path $androidRoot "app\google-services.json"

Write-Host "Preparing Google Play upload bundle..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $keystorePropsPath)) {
  throw "Missing signing config: $keystorePropsPath"
}
if (-not (Test-Path -LiteralPath $googleServicesPath)) {
  throw "Missing Firebase config: $googleServicesPath"
}

Push-Location $frontendRoot
try {
  Write-Host "Step 1/3: Building web assets..." -ForegroundColor Yellow
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm run build
  } else {
    npm run build
  }

  Write-Host "Step 2/3: Syncing Capacitor Android project..." -ForegroundColor Yellow
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm exec cap sync android
  } else {
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
  $pkg = Get-Content -LiteralPath (Join-Path $frontendRoot "package.json") -Raw | ConvertFrom-Json
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
