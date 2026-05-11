# Bump version (versionCode +1, last segment of versionName +1) for one RootRecord Android app,
# rebuild web + Capacitor + Gradle release, and stage APK/AAB under Mobile\builds\<subfolder>\.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release-bump-and-build.ps1 -App weather|business|account|token
#
# This script edits:
#   - Mobile\<app>\android\app\build.gradle  (versionCode + versionName)
#   - Mobile\<app>\package.json              (version)
#   - Web\apps\<name>-web\package.json       (version)
#
# Outputs (after a successful Gradle release build):
#   - Mobile\builds\<subfolder>\RootRecord-<Product>-<version>.apk
#   - Mobile\builds\<subfolder>\RootRecord-<Product>-<version>.aab
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("weather","business","account","token")]
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
    weather  = @{ mobileDir = "weather-manager-mobile"; webDir = "Web\apps\weather-manager-web";  subfolder = "weather-manager";  baseName = "RootRecord-WeatherManager"  }
    business = @{ mobileDir = "business-manager-app";   webDir = "Web\apps\business-manager-web"; subfolder = "business-manager"; baseName = "RootRecord-BusinessManager" }
    account  = @{ mobileDir = "account-hub-app";        webDir = "Web\apps\account-hub-web";      subfolder = "account-hub";      baseName = "RootRecord-AccountHub"      }
    token    = @{ mobileDir = "token-manager-app";      webDir = "Web\apps\token-manager-web";    subfolder = "token-manager";    baseName = "RootRecord-TokenManager"    }
}
$cfg = $config[$App]

$appRoot   = Join-Path $MobileRoot $cfg.mobileDir
$webRoot   = Join-Path $RepoRoot   $cfg.webDir
$gradleApp = Join-Path $appRoot    "android\app\build.gradle"
$webPkg    = Join-Path $webRoot    "package.json"
$mobilePkg = Join-Path $appRoot    "package.json"

foreach ($p in @($appRoot, $webRoot, $gradleApp, $webPkg, $mobilePkg)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Missing: $p" }
}

# Pre-flight: confirm release signing is wired so we don't ship a -unsigned artifact.
# (Release builds without a signingConfig still come out of the `release/` dir but are unusable for Play.)
$gradlePreview = [System.IO.File]::ReadAllText($gradleApp, [System.Text.UTF8Encoding]::new($false))
$hasReleaseSigning = ($gradlePreview -match '(?s)buildTypes\s*\{[^}]*?release\s*\{[^}]*?signingConfig\s+signingConfigs\.release')
if (-not $hasReleaseSigning) {
    Write-Warning "$App build.gradle does not wire signingConfig signingConfigs.release into buildTypes.release."
    Write-Warning "Release build will be UNSIGNED (cannot upload to Play). Add signing config to ship."
} else {
    $keystoreProps = Join-Path $appRoot "android\app\keystore\keystore.properties"
    $keystorePropsAlt = Join-Path $appRoot "android\keystore.properties"
    if (-not (Test-Path -LiteralPath $keystoreProps) -and -not (Test-Path -LiteralPath $keystorePropsAlt)) {
        Write-Warning "$App signing config wired but keystore.properties not found at:"
        Write-Warning "  $keystoreProps"
        Write-Warning "  $keystorePropsAlt"
        Write-Warning "Gradle will fall through to UNSIGNED outputs."
    }
}

function Read-Utf8([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}
function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

# 1) Parse current versionCode / versionName from build.gradle
$gradleText = Read-Utf8 $gradleApp
$mCode = [regex]::Match($gradleText, '(?m)^\s*versionCode\s+(\d+)\s*$')
$mName = [regex]::Match($gradleText, '(?m)^\s*versionName\s+"([^"]+)"\s*$')
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
Write-Host "  Web:     $webRoot"
Write-Host "  App:     $appRoot"
Write-Host ""

# 3) Write new version into build.gradle
$newGradle = $gradleText `
    -replace '(?m)^(\s*versionCode\s+)\d+\s*$', ('${1}' + $newCode) `
    -replace '(?m)^(\s*versionName\s+")[^"]+("\s*)$', ('${1}' + $newName + '${2}')
Write-Utf8 $gradleApp $newGradle

# 4) Write new version into both package.json files (surgical regex; no JSON reformat)
foreach ($p in @($webPkg, $mobilePkg)) {
    $t = Read-Utf8 $p
    $t = [regex]::Replace($t, '"version"\s*:\s*"[^"]+"', ('"version": "' + $newName + '"'), 'IgnoreCase')
    Write-Utf8 $p $t
}

Write-Host "[1/4] Web build ($webRoot)" -ForegroundColor Cyan
Push-Location $webRoot
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install (web) failed" }
    $env:GENERATE_SOURCEMAP = "false"
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "pnpm run build (web) failed" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "[2/4] Cap sync + Gradle release ($appRoot)" -ForegroundColor Cyan
Push-Location $appRoot
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install (android) failed" }
    pnpm exec cap sync android
    if ($LASTEXITCODE -ne 0) { throw "cap sync android failed" }

    $androidDir = Join-Path $appRoot "android"
    Push-Location $androidDir
    try {
        & .\gradlew.bat bundleRelease assembleRelease --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "gradle bundleRelease assembleRelease failed" }
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "[3/4] Stage APK + AAB" -ForegroundColor Cyan
$apkDir = Join-Path $appRoot "android\app\build\outputs\apk\release"
$aabDir = Join-Path $appRoot "android\app\build\outputs\bundle\release"

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
Write-Host "[4/4] Done." -ForegroundColor Green
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
