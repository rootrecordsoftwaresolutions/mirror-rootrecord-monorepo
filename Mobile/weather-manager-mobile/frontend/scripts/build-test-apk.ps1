$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $frontendRoot "android"
$releaseDir = Join-Path $frontendRoot "release"
$apkPath = Join-Path $androidRoot "app\\build\\outputs\\apk\\release\\RootRecord-Weather-release.apk"
$keystorePropsPath = Join-Path $androidRoot "app\\keystore\\keystore.properties"
$googleServicesPath = Join-Path $androidRoot "app\\google-services.json"

Write-Host "Preparing test APK (release build; uninstall old app first)..." -ForegroundColor Cyan

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

  Write-Host "Step 3/3: Building signed release APK..." -ForegroundColor Yellow
  Push-Location $androidRoot
  try {
    .\gradlew.bat assembleRelease
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $apkPath)) {
    throw "Expected APK not found at: $apkPath"
  }

  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
  $dest = Join-Path $releaseDir "RootRecord-Weather.apk"
  Copy-Item -LiteralPath $apkPath -Destination $dest -Force

  $hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
  Write-Host ""
  Write-Host "APK ready:" -ForegroundColor Green
  Write-Host "  $dest"
  Write-Host "SHA256:"
  Write-Host "  $hash"
} finally {
  Pop-Location
}

