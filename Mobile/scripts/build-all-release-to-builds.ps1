# Build web + Capacitor Android release APK/AAB for each RootRecord app and copy into Mobile\builds\<subfolder>.
# Canonical staging layout — documented in Mobile/docs/RELEASE-BUILD-OUTPUTS.md and .cursor/rules/mobile-build-outputs.mdc
# Requires: Node, JDK, Android SDK (ANDROID_HOME), and per-app signing where configured (Weather/BM keystore).
param(
    [string]$MobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$OutRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "builds")
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
# Do not set CI=true — react-scripts treats ESLint warnings as errors under CI.
$env:GENERATE_SOURCEMAP = "false"

function Copy-BuildArtifacts {
    param(
        [string]$Subfolder,
        [string]$FrontendDir,
        [string]$BaseName,
        [string]$Version
    )
    $dest = Join-Path $OutRoot $Subfolder
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $apkDir = Join-Path $FrontendDir "android\app\build\outputs\apk\release"
    $aabDir = Join-Path $FrontendDir "android\app\build\outputs\bundle\release"
    $apk = Get-ChildItem -LiteralPath $apkDir -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
    $aab = Get-ChildItem -LiteralPath $aabDir -Filter "*.aab" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $apk) { throw "No APK in $apkDir" }
    if (-not $aab) { throw "No AAB in $aabDir" }
    Copy-Item -LiteralPath $apk.FullName -Destination (Join-Path $dest "$BaseName-$Version.apk") -Force
    Copy-Item -LiteralPath $aab.FullName -Destination (Join-Path $dest "$BaseName-$Version.aab") -Force
    Write-Host "Copied $($apk.Name) + $($aab.Name) -> $dest"
}

function Invoke-OneApp {
    param(
        [string]$Subfolder,
        [string]$FrontendRel,
        [string]$BaseName,
        [string]$Version,
        [switch]$UseYarn
    )
    $fe = Join-Path $MobileRoot $FrontendRel
    if (-not (Test-Path -LiteralPath $fe)) { throw "Missing frontend dir: $fe" }
    Write-Host "`n========== $Subfolder ($Version) ==========" -ForegroundColor Cyan
    Push-Location $fe
    try {
        if ($UseYarn -and (Get-Command yarn -ErrorAction SilentlyContinue)) {
            yarn install
            if ($LASTEXITCODE -ne 0) { throw "yarn install failed" }
            yarn build
        }
        else {
            # --legacy-peer-deps: Solana deps pull TS 5+ while react-scripts 5 expects TS4 peerOptional (token-manager, etc.).
            if (Test-Path "package-lock.json") {
                npm ci --legacy-peer-deps
            }
            else {
                npm install --legacy-peer-deps
            }
            if ($LASTEXITCODE -ne 0) { throw "npm install/ci failed" }
            npm run build
        }
        if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }

        npx cap sync android
        if ($LASTEXITCODE -ne 0) { throw "cap sync android failed" }

        $androidDir = Join-Path $fe "android"
        Push-Location $androidDir
        try {
            & .\gradlew.bat bundleRelease assembleRelease --no-daemon
            if ($LASTEXITCODE -ne 0) { throw "gradle bundleRelease assembleRelease failed" }
        }
        finally {
            Pop-Location
        }

        Copy-BuildArtifacts -Subfolder $Subfolder -FrontendDir $fe -BaseName $BaseName -Version $Version
    }
    finally {
        Pop-Location
    }
}

# Order: smaller apps first (faster feedback), Weather last (Firebase + signing heavier).
Invoke-OneApp -Subfolder "token-manager" -FrontendRel "token-manager-app\frontend" -BaseName "RootRecord-TokenManager" -Version "0.1.1"
Invoke-OneApp -Subfolder "account-hub" -FrontendRel "account-hub-app\frontend" -BaseName "RootRecord-AccountHub" -Version "0.1.2"
Invoke-OneApp -Subfolder "business-manager" -FrontendRel "business-manager-app\frontend" -BaseName "RootRecord-BusinessManager" -Version "1.09"
Invoke-OneApp -Subfolder "weather-manager" -FrontendRel "weather-manager-mobile\frontend" -BaseName "RootRecord-WeatherManager" -Version "1.0.19"

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
        $apkDir = Join-Path $proj "app\build\outputs\apk\release"
        $aabDir = Join-Path $proj "app\build\outputs\bundle\release"
        $dest = Join-Path $OutRoot "kilauea-alerts"
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        $apk = Get-ChildItem -LiteralPath $apkDir -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
        $aab = Get-ChildItem -LiteralPath $aabDir -Filter "*.aab" -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $apk) { throw "No APK in $apkDir" }
        if (-not $aab) { throw "No AAB in $aabDir" }
        Copy-Item -LiteralPath $apk.FullName -Destination (Join-Path $dest "RootRecord-KilaueaAlerts-$Version.apk") -Force
        Copy-Item -LiteralPath $aab.FullName -Destination (Join-Path $dest "RootRecord-KilaueaAlerts-$Version.aab") -Force
        Write-Host "Copied Kilauea Alerts artifacts -> $dest" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

Invoke-KilaueaAlertsNative -Version "1.0.0"

Write-Host "`nAll builds finished. Output root: $OutRoot" -ForegroundColor Green
