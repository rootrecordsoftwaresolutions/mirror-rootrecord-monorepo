# Apply RootMC D1 schema (remote). Sources SQL from rootrecord-api-account/migrations via MANIFEST.txt.

$ErrorActionPreference = "Stop"

if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {

    $PSNativeCommandUseErrorActionPreference = $false

}



function Import-DotEnvFile([string]$LiteralPath, [switch]$SkipCloudflareKeys) {

    if (-not (Test-Path -LiteralPath $LiteralPath)) { return }

    Get-Content -LiteralPath $LiteralPath | ForEach-Object {

        $line = $_.Trim()

        if (-not $line -or $line.StartsWith("#")) { return }

        $p = $line.IndexOf("=")

        if ($p -gt 0) {

            $k = $line.Substring(0, $p).Trim()

            $v = $line.Substring($p + 1).Trim()

            if ($SkipCloudflareKeys -and $k -match '^CLOUDFLARE_|^ROOTMC_CLOUDFLARE_') { return }

            if ($k -and $v) { Set-Item -Path "Env:$k" -Value $v }

        }

    }

}



$rootMcCurrentEnv = "C:\Users\rrdeveloper\Desktop\RootMC - Current\.env"
$rootMcLocalEnv = "C:\Users\rrdeveloper\Desktop\RootMC - Current\_local\.env"

$repoRoot = $null
$probe = $PSScriptRoot
for ($i = 0; $i -le 12; $i++) {
    if (Test-Path (Join-Path $probe "credentials.env")) { $repoRoot = $probe; break }
    $parent = Split-Path $probe -Parent
    if (-not $parent -or $parent -eq $probe) { break }
    $probe = $parent
}
if ($repoRoot) { Import-DotEnvFile (Join-Path $repoRoot "credentials.env") -SkipCloudflareKeys }
if (Test-Path $rootMcLocalEnv) { Import-DotEnvFile $rootMcLocalEnv -SkipCloudflareKeys }
if (Test-Path $rootMcCurrentEnv) { Import-DotEnvFile $rootMcCurrentEnv }

Remove-Item Env:CLOUDFLARE_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:CLOUDFLARE_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:CLOUDFLARE_GLOBAL_API_KEY -ErrorAction SilentlyContinue

if (-not $env:CLOUDFLARE_API_TOKEN -or $env:CLOUDFLARE_API_TOKEN.Length -lt 20) {
    throw "Set CLOUDFLARE_API_TOKEN in Desktop\RootMC - Current\.env"
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
    throw "Set CLOUDFLARE_ACCOUNT_ID in Desktop\RootMC - Current\.env"
}



Set-Location $PSScriptRoot

$manifest = Join-Path $PSScriptRoot "migrations\MANIFEST.txt"

if (-not (Test-Path $manifest)) { throw "Missing $manifest" }

$accountMigrations = Join-Path (Split-Path $PSScriptRoot -Parent) "rootrecord-api-account\migrations"



# Track applied migrations (remote D1 is not re-runnable for CREATE TABLE).

$appliedFile = Join-Path $PSScriptRoot "migrations\.d1-applied-remote.txt"

$applied = @{}

if (Test-Path $appliedFile) {

    Get-Content $appliedFile | ForEach-Object { if ($_.Trim()) { $applied[$_.Trim()] = $true } }

}



foreach ($line in Get-Content $manifest) {

    $file = $line.Trim()

    if (-not $file -or $file.StartsWith("#")) { continue }

    if ($applied.ContainsKey($file)) {

        Write-Host "Skip (already applied): $file"

        continue

    }

    $path = Join-Path $accountMigrations $file

    if (-not (Test-Path $path)) { throw "Migration not found: $path" }

    Write-Host "Applying $file ..."

    npx wrangler d1 execute rootmc --remote --file="$path"

    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Add-Content -LiteralPath $appliedFile -Value $file

}

Write-Host "RootMC D1 migrations complete."
exit 0

