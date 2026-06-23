# Insert featured RootMC server row into rootmc D1 (same server_id/secret as live cloud.yml).
# Run after d1-apply-remote.ps1. Idempotent (INSERT OR REPLACE).
$ErrorActionPreference = "Stop"

function Import-DotEnvFile([string]$LiteralPath) {
    if (-not (Test-Path -LiteralPath $LiteralPath)) { return }
    Get-Content -LiteralPath $LiteralPath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $p = $line.IndexOf("=")
        if ($p -gt 0) {
            $k = $line.Substring(0, $p).Trim()
            $v = $line.Substring($p + 1).Trim()
            if ($k) { Set-Item -Path "Env:$k" -Value $v }
        }
    }
}

$cloudCandidates = @(
    "C:\Users\rrdeveloper\Desktop\RootMC - Current\plugins\RootRecord\cloud.yml",
    "C:\Users\rrdeveloper\Desktop\RootMC\plugins\RootRecord\cloud.yml",
    (Join-Path (Split-Path $PSScriptRoot -Parent) "..\..\..\Desktop\RootMC - Current\plugins\RootRecord\cloud.yml")
)
$cloudYml = $cloudCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cloudYml) { throw "cloud.yml not found - set server-id and server-secret in RootMC - Current\plugins\RootRecord\cloud.yml" }

$serverId = $null
$serverSecret = $null
Get-Content $cloudYml | ForEach-Object {
    if ($_ -match '^\s*server-id:\s*"?([^"#]+)"?') { $serverId = $Matches[1].Trim() }
    if ($_ -match '^\s*server-secret:\s*"?([^"#]+)"?') { $serverSecret = $Matches[1].Trim() }
}
if (-not $serverId -or -not $serverSecret) { throw "server-id / server-secret missing in $cloudYml" }

$hash = [BitConverter]::ToString(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($serverSecret))
).Replace("-", "").ToLower()

$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$sql = @"
INSERT INTO rootstat_servers (
  server_id, server_name, server_secret_hash, owner_account_id,
  created_at, updated_at, server_address, default_world_name,
  map_url, game_version, featured
) VALUES (
  '$serverId',
  'RootMC',
  '$hash',
  '',
  '$now',
  '$now',
  'play.rootmc.net',
  'RootMC',
  'https://map.rootmc.net/',
  '26.1',
  1
) ON CONFLICT(server_id) DO UPDATE SET
  server_secret_hash = excluded.server_secret_hash,
  server_name = excluded.server_name,
  server_address = excluded.server_address,
  default_world_name = excluded.default_world_name,
  map_url = excluded.map_url,
  game_version = excluded.game_version,
  featured = excluded.featured,
  updated_at = excluded.updated_at;
"@

$tmp = Join-Path $env:TEMP "rootmc-seed-server.sql"
Set-Content -LiteralPath $tmp -Value $sql -Encoding UTF8

$rootMcCurrentEnv = "C:\Users\rrdeveloper\Desktop\RootMC - Current\.env"
$rootMcLocalEnv = "C:\Users\rrdeveloper\Desktop\RootMC - Current\_local\.env"
if (Test-Path $rootMcLocalEnv) { Import-DotEnvFile $rootMcLocalEnv -SkipCloudflareKeys }
if (Test-Path $rootMcCurrentEnv) { Import-DotEnvFile $rootMcCurrentEnv }
Remove-Item Env:CLOUDFLARE_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:CLOUDFLARE_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:CLOUDFLARE_GLOBAL_API_KEY -ErrorAction SilentlyContinue

Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "Seeding rootstat_servers server_id=$serverId ..."
npx wrangler d1 execute rootmc --remote --file="$tmp"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Featured server row ready (auth uses existing cloud.yml secret)."
