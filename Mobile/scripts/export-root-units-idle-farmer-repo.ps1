# Export Root Units Idle Farmer (web + mobile + API slice) into a standalone git repo folder.
# Default destination: sibling of MonoRepo: ..\Root-Units-Idle-Farmer
param(
    [string]$Destination = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "..\Root-Units-Idle-Farmer")
)

$ErrorActionPreference = "Stop"
$mono = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$dest = [System.IO.Path]::GetFullPath($Destination)

$robocopyExcludeDirs = @("node_modules", "build", "dist", ".gradle", ".wrangler", "capacitor-cordova-android-plugins")
$robocopyExcludeFiles = @("*.jks", "*.keystore", "keystore.properties", "local.properties", "SIGNING-CREDENTIALS-LOCAL.txt")

function Copy-Tree([string]$Relative) {
    $from = Join-Path $mono $Relative
    if (-not (Test-Path -LiteralPath $from)) {
        throw "Missing source: $from"
    }
    $to = Join-Path $dest $Relative
    $null = New-Item -ItemType Directory -Force -Path (Split-Path $to -Parent) | Out-Null
    $xd = ($robocopyExcludeDirs | ForEach-Object { "/XD"; $_ })
    $xf = ($robocopyExcludeFiles | ForEach-Object { "/XF"; $_ })
    $args = @($from, $to, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS") + $xd + $xf
    $code = (Start-Process -FilePath "robocopy.exe" -ArgumentList $args -Wait -PassThru).ExitCode
    if ($code -ge 8) { throw "robocopy failed ($code) for $Relative" }
}

Write-Host "Exporting from $mono"
Write-Host "Destination: $dest"

if (Test-Path -LiteralPath $dest) {
    Write-Host "Updating existing folder..."
} else {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
}

@(
    "Web\apps\root-farms-web",
    "Web\apps\root-farms-mobile-web",
    "Mobile\root-farms-app",
    "Web\main\root-farms"
) | ForEach-Object { Copy-Tree $_ }

$scriptsDest = Join-Path $dest "Mobile\scripts"
New-Item -ItemType Directory -Force -Path $scriptsDest | Out-Null
Copy-Item -LiteralPath (Join-Path $mono "Mobile\scripts\bump-mobile-version.ps1") -Destination $scriptsDest -Force
Copy-Item -LiteralPath (Join-Path $mono "Mobile\scripts\stage-release-artifacts.ps1") -Destination $scriptsDest -Force

$apiDest = Join-Path $dest "Web\cloudflare\rootrecord-api-account"
New-Item -ItemType Directory -Force -Path (Join-Path $apiDest "migrations") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $apiDest "src") | Out-Null
$apiFiles = @(
    "migrations\0046_rr_farms_progress.sql",
    "migrations\0047_rr_farms_last_harvest.sql",
    "migrations\0049_rr_farms_varmint.sql",
    "src\farms.ts",
    "src\farms-catalog.ts",
    "src\farms-varmint.ts"
)
foreach ($rel in $apiFiles) {
    Copy-Item -LiteralPath (Join-Path $mono "Web\cloudflare\rootrecord-api-account\$rel") -Destination (Join-Path $apiDest $rel) -Force
}

$buildsDest = Join-Path $dest "Mobile\builds\root-farms"
New-Item -ItemType Directory -Force -Path $buildsDest | Out-Null
if (-not (Test-Path (Join-Path $buildsDest ".gitkeep"))) {
    Set-Content -Path (Join-Path $buildsDest ".gitkeep") -Value "" -Encoding ascii
}

foreach ($bat in @("build-root-farms-android.bat", "cloudflare-deploy-root-farms.bat")) {
    Copy-Item -LiteralPath (Join-Path $mono $bat) -Destination (Join-Path $dest $bat) -Force
}

Write-Host "Done. Next: cd `"$dest`"; git init; git add -A; git commit; gh repo create ..."
