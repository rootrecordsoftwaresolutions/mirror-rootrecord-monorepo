# Build web + Capacitor Android release APK/AAB for each RootRecord app and copy into Mobile\builds\<subfolder>.
# Web source lives under Web\apps\<name>-web (isolated from Mobile). Android wrapper lives under Mobile\<app>\.
# Canonical staging layout — documented in Mobile/docs/RELEASE-BUILD-OUTPUTS.md and .cursor/rules/mobile-build-outputs.mdc
# Requires: Node, JDK, Android SDK (ANDROID_HOME), and per-app signing where configured (Weather/BM keystore).
param(
    [string]$MobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$OutRoot    = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "builds")
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
# Do not set CI=true — react-scripts treats ESLint warnings as errors under CI.
$env:GENERATE_SOURCEMAP = "false"
if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS) -or $env:NODE_OPTIONS -notmatch "max-old-space-size") {
    $env:NODE_OPTIONS = "--max-old-space-size=8192 --max-semi-space-size=128"
}

function Copy-BuildArtifacts {
    param(
        [string]$Subfolder,
        [string]$AppDir,
        [string]$BaseName,
        [string]$Version
    )
    $dest = Join-Path $OutRoot $Subfolder
    $stageScript = Join-Path $PSScriptRoot "stage-release-artifacts.ps1"
    $lines = & powershell -NoProfile -ExecutionPolicy Bypass -File $stageScript `
        -AppDir $AppDir -DestDir $dest -BaseName $BaseName -Version $Version
    if ($LASTEXITCODE -ne 0) { throw "stage-release-artifacts.ps1 failed for $Subfolder" }
    foreach ($line in $lines) {
        if ($line -match '^(APK|AAB)\|') { Write-Host "  $line" }
    }
}

function Invoke-OneApp {
    param(
        [string]$Subfolder,
        [string]$WebRel,     # relative to RepoRoot, e.g. "Web\apps\weather-manager-web"
        [string]$AppRel,     # relative to MobileRoot, e.g. "weather-manager-mobile"
        [string]$BaseName,
        [string]$Version
    )
    $web = Join-Path $RepoRoot $WebRel
    $app = Join-Path $MobileRoot $AppRel
    if (-not (Test-Path -LiteralPath $web)) { throw "Missing web dir: $web" }
    if (-not (Test-Path -LiteralPath $app)) { throw "Missing app dir: $app" }
    Write-Host "`n========== $Subfolder ($Version) ==========" -ForegroundColor Cyan

    # 1) Build the web app
    Push-Location $web
    try {
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install (web) failed in $web" }
        pnpm run build
        if ($LASTEXITCODE -ne 0) { throw "web build failed in $web" }
    }
    finally {
        Pop-Location
    }

    # 2) Cap sync from the Mobile app dir (capacitor.config.json webDir points at the web build)
    Push-Location $app
    try {
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install (android) failed in $app" }
        pnpm exec cap sync android
        if ($LASTEXITCODE -ne 0) { throw "cap sync android failed in $app" }

        # 3) Gradle release build
        $androidDir = Join-Path $app "android"
        Push-Location $androidDir
        try {
            & .\gradlew.bat bundleRelease assembleRelease --no-daemon
            if ($LASTEXITCODE -ne 0) { throw "gradle bundleRelease assembleRelease failed" }
        }
        finally {
            Pop-Location
        }

        Copy-BuildArtifacts -Subfolder $Subfolder -AppDir $app -BaseName $BaseName -Version $Version
    }
    finally {
        Pop-Location
    }
}

# Order: smaller apps first (faster feedback), Weather last (Firebase + signing heavier).
Invoke-OneApp -Subfolder "root-farms"       -WebRel "Web\apps\root-farms-mobile-web" -AppRel "root-farms-app"         -BaseName "RootRecord-RootFarms"       -Version "0.1.0"
Invoke-OneApp -Subfolder "token-manager"    -WebRel "Web\apps\token-manager-web"    -AppRel "token-manager-app"      -BaseName "RootRecord-TokenManager"    -Version "0.1.1"
Invoke-OneApp -Subfolder "account-hub"      -WebRel "Web\apps\account-hub-web"      -AppRel "account-hub-app"        -BaseName "RootRecord-AccountHub"      -Version "0.1.2"
Invoke-OneApp -Subfolder "business-manager" -WebRel "Web\apps\business-manager-web" -AppRel "business-manager-app"   -BaseName "RootRecord-BusinessManager" -Version "1.09"
Invoke-OneApp -Subfolder "weather-manager"  -WebRel "Web\apps\weather-manager-web"  -AppRel "weather-manager-mobile" -BaseName "RootRecord-WeatherManager"  -Version "1.0.19"

function Invoke-KilaueaAlertsNative {
    param(
        [string]$Version = "1.0.0"
    )
    $proj = Join-Path $MobileRoot "kilauea-alerts-android"
    if (-not (Test-Path -LiteralPath $proj)) {
        Write-Host "Skip kilauea-alerts (directory missing): $proj" -ForegroundColor Yellow
        return
    }
    Write-Host "`n========== kilauea-alerts (native Kotlin / $Version) ==========" -ForegroundColor Cyan
    Push-Location $proj
    try {
        & .\gradlew.bat bundleRelease assembleRelease --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "kilauea-alerts-android gradle bundleRelease assembleRelease failed" }
        $dest = Join-Path $OutRoot "kilauea-alerts"
        $stageScript = Join-Path $PSScriptRoot "stage-release-artifacts.ps1"
        $lines = & powershell -NoProfile -ExecutionPolicy Bypass -File $stageScript `
            -AppDir $proj -DestDir $dest -BaseName "RootRecord-Kilauea-Alerts" -Version $Version -Native
        if ($LASTEXITCODE -ne 0) { throw "stage-release-artifacts.ps1 failed for kilauea-alerts" }
        foreach ($line in $lines) {
            if ($line -match '^(APK|AAB)\|') { Write-Host "  $line" }
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-KilaueaAlertsNative -Version "1.0.0"

Write-Host "`nAll builds finished. Output root: $OutRoot" -ForegroundColor Green
