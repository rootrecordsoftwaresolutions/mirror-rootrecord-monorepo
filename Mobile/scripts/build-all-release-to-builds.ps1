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
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
# Do not set CI=true — react-scripts treats ESLint warnings as errors under CI.
$env:GENERATE_SOURCEMAP = "false"
if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS) -or $env:NODE_OPTIONS -notmatch "max-old-space-size") {
    $env:NODE_OPTIONS = "--max-old-space-size=8192 --max-semi-space-size=128"
}

function Invoke-NoisyNative {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & cmd.exe /d /s /c "$Command 2>&1"
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
    if ($code -ne 0) { throw "$FailureMessage (exit $code)" }
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
        Invoke-NoisyNative "pnpm install" "pnpm install (web) failed in $web"
        Invoke-NoisyNative "pnpm run build" "web build failed in $web"
    }
    finally {
        Pop-Location
    }

    # 2) Cap sync from the Mobile app dir (capacitor.config.json webDir points at the web build)
    Push-Location $app
    try {
        Invoke-NoisyNative "pnpm install" "pnpm install (android) failed in $app"
        Invoke-NoisyNative "pnpm exec cap sync android" "cap sync android failed in $app"

        # 3) Gradle release build
        $androidDir = Join-Path $app "android"
        Push-Location $androidDir
        try {
            Invoke-NoisyNative ".\gradlew.bat bundleRelease assembleRelease --no-daemon" "gradle bundleRelease assembleRelease failed"
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

function Get-PackageVersion {
    param([string]$PackageJsonPath)
    if (-not (Test-Path -LiteralPath $PackageJsonPath)) { throw "Missing package.json: $PackageJsonPath" }
    $pkg = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
    $version = [string]$pkg.version
    if ([string]::IsNullOrWhiteSpace($version)) { throw "No version in $PackageJsonPath" }
    return $version
}

function Get-GradleVersionName {
    param([string]$GradlePath)
    if (-not (Test-Path -LiteralPath $GradlePath)) { throw "Missing Gradle file: $GradlePath" }
    $text = Get-Content -LiteralPath $GradlePath -Raw
    $m = [regex]::Match($text, 'versionName\s*=?\s*"([^"]+)"')
    if (-not $m.Success) { throw "No versionName in $GradlePath" }
    return $m.Groups[1].Value
}

# Order: smaller apps first (faster feedback), Weather last (Firebase + signing heavier).
Invoke-OneApp -Subfolder "root-farms"       -WebRel "Web\apps\root-farms-mobile-web" -AppRel "root-farms-app"         -BaseName "RootRecord-RootFarms"       -Version (Get-PackageVersion (Join-Path $MobileRoot "root-farms-app\package.json"))
Invoke-OneApp -Subfolder "token-manager"    -WebRel "Web\apps\token-manager-web"    -AppRel "token-manager-app"      -BaseName "RootRecord-TokenManager"    -Version (Get-PackageVersion (Join-Path $MobileRoot "token-manager-app\package.json"))
Invoke-OneApp -Subfolder "account-hub"      -WebRel "Web\apps\account-hub-web"      -AppRel "account-hub-app"        -BaseName "RootRecord-AccountHub"      -Version (Get-PackageVersion (Join-Path $MobileRoot "account-hub-app\package.json"))
Invoke-OneApp -Subfolder "business-manager" -WebRel "Web\apps\business-manager-web" -AppRel "business-manager-app"   -BaseName "RootRecord-BusinessManager" -Version (Get-PackageVersion (Join-Path $MobileRoot "business-manager-app\package.json"))
Invoke-OneApp -Subfolder "root-goals"       -WebRel "Web\apps\root-goals-web"       -AppRel "root-goals-mobile"      -BaseName "RootRecord-RootGoals"       -Version (Get-PackageVersion (Join-Path $MobileRoot "root-goals-mobile\package.json"))
Invoke-OneApp -Subfolder "weather-manager"  -WebRel "Web\apps\weather-manager-web"  -AppRel "weather-manager-mobile" -BaseName "RootRecord-WeatherManager"  -Version (Get-PackageVersion (Join-Path $MobileRoot "weather-manager-mobile\package.json"))

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
        Invoke-NoisyNative ".\gradlew.bat bundleRelease assembleRelease --no-daemon" "kilauea-alerts-android gradle bundleRelease assembleRelease failed"
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

Invoke-KilaueaAlertsNative -Version (Get-GradleVersionName (Join-Path $MobileRoot "kilauea-alerts-android\app\build.gradle.kts"))

function Invoke-RootMcNative {
    param(
        [string]$Version = "0.1.0"
    )
    $proj = Join-Path $MobileRoot "rootmc-android"
    if (-not (Test-Path -LiteralPath $proj)) {
        Write-Host "Skip rootmc-android (directory missing): $proj" -ForegroundColor Yellow
        return
    }
    Write-Host "`n========== rootmc-android (native Kotlin / $Version) ==========" -ForegroundColor Cyan
    Push-Location $proj
    try {
        Invoke-NoisyNative ".\gradlew.bat bundleRelease assembleRelease --no-daemon" "rootmc-android gradle bundleRelease assembleRelease failed"
        $dest = Join-Path $OutRoot "rootmc"
        $stageScript = Join-Path $PSScriptRoot "stage-release-artifacts.ps1"
        $lines = & powershell -NoProfile -ExecutionPolicy Bypass -File $stageScript `
            -AppDir $proj -DestDir $dest -BaseName "RootRecord-RootMC" -Version $Version -Native
        if ($LASTEXITCODE -ne 0) { throw "stage-release-artifacts.ps1 failed for rootmc-android" }
        foreach ($line in $lines) {
            if ($line -match '^(APK|AAB)\|') { Write-Host "  $line" }
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-RootMcNative -Version (Get-GradleVersionName (Join-Path $MobileRoot "rootmc-android\app\build.gradle.kts"))

Write-Host "`nAll builds finished. Output root: $OutRoot" -ForegroundColor Green
