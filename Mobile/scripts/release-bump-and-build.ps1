# Bump version (versionCode +1, last segment of versionName +1) for one RootRecord Android app,
# run cap sync + Gradle release, and stage APK/AAB under Mobile\builds\<subfolder>\.
#
# Web/mobile are independent: this script does NOT build the React app or touch Web\apps\*.
# It expects Web\apps\<name>-web\build\index.html to already exist (produced by
# cloudflare-update-pages.bat or a manual `pnpm run build` over in the web project).
# Capacitor's webDir in capacitor.config.json points at that build/ dir and `cap sync` just
# copies whatever is there into the Android assets.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release-bump-and-build.ps1 -App weather|business|account|token|kilauea
#
# This script edits:
#   - Mobile\<app>\android\app\build.gradle  (versionCode + versionName)
#   - Mobile\<app>\package.json              (version)
#
# Outputs (after a successful Gradle release build):
#   - Mobile\builds\<subfolder>\RootRecord-<Product>-<version>.apk
#   - Mobile\builds\<subfolder>\RootRecord-<Product>-<version>.aab
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("weather","business","account","token","kilauea")]
    [string]$App
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$MobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$OutRoot    = Join-Path $MobileRoot "builds"

$config = @{
    weather  = @{ native = $false; mobileDir = "weather-manager-mobile";  webDir = "Web\apps\weather-manager-web";  subfolder = "weather-manager";  baseName = "RootRecord-WeatherManager"  }
    business = @{ native = $false; mobileDir = "business-manager-app";    webDir = "Web\apps\business-manager-web"; subfolder = "business-manager"; baseName = "RootRecord-BusinessManager" }
    account  = @{ native = $false; mobileDir = "account-hub-app";         webDir = "Web\apps\account-hub-web";      subfolder = "account-hub";      baseName = "RootRecord-AccountHub"      }
    token    = @{ native = $false; mobileDir = "token-manager-app";       webDir = "Web\apps\token-manager-web";    subfolder = "token-manager";    baseName = "RootRecord-TokenManager"    }
    kilauea  = @{ native = $true;  mobileDir = "kilauea-alerts-android";  webDir = "";                              subfolder = "kilauea-alerts";   baseName = "RootRecord-Kilauea-Alerts"  }
}
$cfg = $config[$App]

$appRoot = Join-Path $MobileRoot $cfg.mobileDir

if ($cfg.native) {
    # Native Kotlin (Gradle KTS): no Capacitor, no web build, no package.json updates.
    $gradleApp = Join-Path $appRoot "app\build.gradle.kts"
    $webRoot   = $null
    $webPkg    = $null
    $mobilePkg = $null
    foreach ($p in @($appRoot, $gradleApp)) {
        if (-not (Test-Path -LiteralPath $p)) { throw "Missing: $p" }
    }
} else {
    $webRoot   = Join-Path $RepoRoot $cfg.webDir
    $gradleApp = Join-Path $appRoot  "android\app\build.gradle"
    $mobilePkg = Join-Path $appRoot  "package.json"
    foreach ($p in @($appRoot, $webRoot, $gradleApp, $mobilePkg)) {
        if (-not (Test-Path -LiteralPath $p)) { throw "Missing: $p" }
    }
    # Capacitor's webDir is `<webRoot>/build`. cap sync copies that into Android assets, so the
    # APK is unusable if it's empty. Fail loudly here with a clear remediation path instead of
    # shipping a blank-screen app.
    $webBuildDir = Join-Path $webRoot "build"
    $webBuildIndex = Join-Path $webBuildDir "index.html"
    if (-not (Test-Path -LiteralPath $webBuildIndex)) {
        throw @"
Web build not found at: $webBuildIndex

The mobile bat only builds the Android APK + AAB. It bundles whatever is currently in
$webBuildDir into the app (per capacitor.config.json's webDir).

Produce that build first by running ONE of:
  - cloudflare-update-pages.bat   (rebuilds + deploys all web apps)
  - cd $webRoot ; pnpm install ; pnpm run build   (just builds the web app locally)

Then re-run this bat.
"@
    }
}

# Pre-flight: confirm release signing is wired so we don't ship a -unsigned artifact.
# (Release builds without a signingConfig still come out of the `release/` dir but are unusable for Play.)
$gradlePreview = [System.IO.File]::ReadAllText($gradleApp, [System.Text.UTF8Encoding]::new($false))
if ($cfg.native) {
    $hasReleaseSigning = ($gradlePreview -match '(?s)buildTypes\s*\{[^}]*?release\s*\{[^}]*?signingConfig\s*=\s*signingConfigs\.getByName\("release"\)')
} else {
    $hasReleaseSigning = ($gradlePreview -match '(?s)buildTypes\s*\{[^}]*?release\s*\{[^}]*?signingConfig\s+signingConfigs\.release')
}
if (-not $hasReleaseSigning) {
    Write-Warning "$App build.gradle does not wire a release signingConfig into buildTypes.release."
    Write-Warning "Release build will be UNSIGNED (cannot upload to Play). Add signing config to ship."
} elseif (-not $cfg.native) {
    $keystoreProps = Join-Path $appRoot "android\app\keystore\keystore.properties"
    $keystorePropsAlt = Join-Path $appRoot "android\keystore.properties"
    if (-not (Test-Path -LiteralPath $keystoreProps) -and -not (Test-Path -LiteralPath $keystorePropsAlt)) {
        Write-Warning "$App signing config wired but keystore.properties not found at:"
        Write-Warning "  $keystoreProps"
        Write-Warning "  $keystorePropsAlt"
        Write-Warning "Gradle will fall through to UNSIGNED outputs."
    }
} else {
    $localProps = Join-Path $appRoot "local.properties"
    if (-not (Test-Path -LiteralPath $localProps)) {
        Write-Warning "$App signing reads local.properties but it is missing: $localProps"
        Write-Warning "Gradle will fall through to UNSIGNED outputs."
    }
}

function Read-Utf8([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}
function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

# 1) Parse current versionCode / versionName from build.gradle (Groovy `foo 1` or Kotlin DSL `foo = 1`)
$gradleText = Read-Utf8 $gradleApp
if ($cfg.native) {
    $mCode = [regex]::Match($gradleText, '(?m)^\s*versionCode\s*=\s*(\d+)\s*$')
    $mName = [regex]::Match($gradleText, '(?m)^\s*versionName\s*=\s*"([^"]+)"\s*$')
} else {
    $mCode = [regex]::Match($gradleText, '(?m)^\s*versionCode\s+(\d+)\s*$')
    $mName = [regex]::Match($gradleText, '(?m)^\s*versionName\s+"([^"]+)"\s*$')
}
if (-not $mCode.Success -or -not $mName.Success) { throw "Could not parse versionCode/versionName from $gradleApp" }
$oldCode = [int]$mCode.Groups[1].Value
$oldName = $mName.Groups[1].Value

# 2) Bump: versionCode +1, versionName last segment +1
$parts = $oldName -split '\.'
$parts[-1] = ([int]$parts[-1] + 1).ToString()
$newName = ($parts -join '.')
$newCode = $oldCode + 1

Write-Host ""
Write-Host "=== $App release ===" -ForegroundColor Cyan
Write-Host "  Version: $oldName ($oldCode) -> $newName ($newCode)"
if ($cfg.native) {
    Write-Host "  App:     $appRoot (native Kotlin / Gradle KTS)"
} else {
    Write-Host "  Web:     $webRoot"
    Write-Host "  App:     $appRoot"
}
Write-Host ""

# 3) Write new version into build.gradle / build.gradle.kts
if ($cfg.native) {
    $newGradle = $gradleText `
        -replace '(?m)^(\s*versionCode\s*=\s*)\d+(\s*)$', ('${1}' + $newCode + '${2}') `
        -replace '(?m)^(\s*versionName\s*=\s*")[^"]+("\s*)$', ('${1}' + $newName + '${2}')
} else {
    $newGradle = $gradleText `
        -replace '(?m)^(\s*versionCode\s+)\d+\s*$', ('${1}' + $newCode) `
        -replace '(?m)^(\s*versionName\s+")[^"]+("\s*)$', ('${1}' + $newName + '${2}')
}
Write-Utf8 $gradleApp $newGradle

# 4) Web/Capacitor flow (skipped for native apps)
if ($cfg.native) {
    Write-Host "[1/3] (native Kotlin) no web bundle, no cap sync." -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "[2/3] Gradle release ($appRoot)" -ForegroundColor Cyan
    Push-Location $appRoot
    try {
        # Keep the Gradle daemon alive between runs — cold-starting the JVM + reconfig on every
        # invocation was adding several minutes per build. The daemon stays warm in the user's
        # session and is reused across all five app bumps.
        & .\gradlew.bat bundleRelease assembleRelease
        if ($LASTEXITCODE -ne 0) { throw "gradle bundleRelease assembleRelease failed" }
    } finally {
        Pop-Location
    }
} else {
    # Only the mobile package.json gets the version bump. The web project is a separate codebase
    # with its own versioning lifecycle (deployed by cloudflare-update-pages.bat) — this script
    # never touches it.
    $t = Read-Utf8 $mobilePkg
    $t = [regex]::Replace($t, '"version"\s*:\s*"[^"]+"', ('"version": "' + $newName + '"'), 'IgnoreCase')
    Write-Utf8 $mobilePkg $t

    $buildIndex = Join-Path $webRoot 'build\index.html'
    $buildAge = (New-TimeSpan -Start (Get-Item -LiteralPath $buildIndex).LastWriteTime -End (Get-Date)).TotalMinutes
    Write-Host ("[1/3] Bundling existing web build from $webRoot\build  ({0:N1} min old)" -f $buildAge) -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "[2/3] Cap sync + Gradle release ($appRoot)" -ForegroundColor Cyan
    Push-Location $appRoot
    try {
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install (android) failed" }
        pnpm exec cap sync android
        if ($LASTEXITCODE -ne 0) { throw "cap sync android failed" }

        $androidDir = Join-Path $appRoot "android"
        Push-Location $androidDir
        try {
            # See note in the native branch: keep daemon alive to cut multi-minute JVM cold-start.
            & .\gradlew.bat bundleRelease assembleRelease
            if ($LASTEXITCODE -ne 0) { throw "gradle bundleRelease assembleRelease failed" }
        } finally {
            Pop-Location
        }
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "[3/3] Stage APK + AAB" -ForegroundColor Cyan
if ($cfg.native) {
    $apkDir = Join-Path $appRoot "app\build\outputs\apk\release"
    $aabDir = Join-Path $appRoot "app\build\outputs\bundle\release"
} else {
    $apkDir = Join-Path $appRoot "android\app\build\outputs\apk\release"
    $aabDir = Join-Path $appRoot "android\app\build\outputs\bundle\release"
}

# Hard rule: only accept artifacts from the release/ output dir, with "release" in the filename
# and no "debug" anywhere. Refuses to ship a debug variant even if one somehow sat in release/.
function Select-ReleaseArtifact([string]$Dir, [string]$Ext, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Dir)) { throw "No $Label release output dir: $Dir" }
    $candidates = Get-ChildItem -LiteralPath $Dir -Filter "*.$Ext" -File -ErrorAction SilentlyContinue
    $debug = $candidates | Where-Object { $_.Name -match '(?i)debug' }
    if ($debug) { throw ("$Label release dir contains debug-tagged file(s); refusing to ship: " + ($debug.Name -join ', ')) }
    $releaseFiles = $candidates | Where-Object { $_.Name -match '(?i)release' }
    if (-not $releaseFiles) { $releaseFiles = $candidates }
    $pick = $releaseFiles | Select-Object -First 1
    if (-not $pick) { throw "No $Label found under $Dir" }
    return $pick
}

$apk = Select-ReleaseArtifact $apkDir 'apk' 'APK'
$aab = Select-ReleaseArtifact $aabDir 'aab' 'AAB'

$apkUnsigned = $apk.Name -match '(?i)unsigned'
$aabUnsigned = $aab.Name -match '(?i)unsigned'

$dest = Join-Path $OutRoot $cfg.subfolder
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$apkSuffix = if ($apkUnsigned) { "-unsigned.apk" } else { ".apk" }
$aabSuffix = if ($aabUnsigned) { "-unsigned.aab" } else { ".aab" }
$apkDest = Join-Path $dest ("{0}-{1}{2}" -f $cfg.baseName, $newName, $apkSuffix)
$aabDest = Join-Path $dest ("{0}-{1}{2}" -f $cfg.baseName, $newName, $aabSuffix)
Copy-Item -LiteralPath $apk.FullName -Destination $apkDest -Force
Copy-Item -LiteralPath $aab.FullName -Destination $aabDest -Force

$apkHash = (Get-FileHash -LiteralPath $apkDest -Algorithm SHA256).Hash
$aabHash = (Get-FileHash -LiteralPath $aabDest -Algorithm SHA256).Hash

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  Version:        $newName ($newCode)"
Write-Host "  Variant:        release"
Write-Host "  APK source:     $($apk.Name)"
Write-Host "  AAB source:     $($aab.Name)"
Write-Host "  APK staged:     $apkDest"
Write-Host "  AAB staged:     $aabDest"
Write-Host "  SHA256 (APK):   $apkHash"
Write-Host "  SHA256 (AAB):   $aabHash"

if ($apkUnsigned -or $aabUnsigned) {
    Write-Warning "Output is UNSIGNED (filename ended with -unsigned). Not Play-store ready."
}
