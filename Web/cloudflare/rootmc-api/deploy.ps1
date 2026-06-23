# Deploy rootmc-api to the RootMC Cloudflare account (api.rootmc.net).
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
$mainDevEnv = Join-Path $repoRoot "Web\main\.env"
if ($repoRoot -and (Test-Path $mainDevEnv)) { Import-DotEnvFile $mainDevEnv -SkipCloudflareKeys }
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
$tomlPath = Join-Path $PSScriptRoot "wrangler.toml"
$toml = Get-Content -LiteralPath $tomlPath -Raw

if ($toml -match 'database_id = "REPLACE_AFTER_D1_CREATE"') {
    Write-Host "Creating D1 database rootmc ..."
    $createOut = npx wrangler d1 create rootmc 2>&1 | Out-String
    if ($createOut -match 'database_id\s*=\s*"([a-f0-9-]+)"') {
        $newId = $Matches[1]
        $toml = $toml -replace 'database_id = "REPLACE_AFTER_D1_CREATE"', "database_id = `"$newId`""
        Set-Content -LiteralPath $tomlPath -Value $toml -NoNewline
        Write-Host "Updated wrangler.toml database_id=$newId"
    } elseif ($createOut -match "already exists") {
        $listJson = npx wrangler d1 list --json 2>&1 | Out-String
        if ($listJson -match '"name":"rootmc"[^}]*"uuid":"([a-f0-9-]+)"') {
            $newId = $Matches[1]
            $toml = $toml -replace 'database_id = "REPLACE_AFTER_D1_CREATE"', "database_id = `"$newId`""
            Set-Content -LiteralPath $tomlPath -Value $toml -NoNewline
            Write-Host "Using existing D1 rootmc id=$newId"
        } else {
            throw "D1 rootmc exists but could not parse id. Set database_id in wrangler.toml manually.`n$createOut"
        }
    } else {
        throw "D1 create failed:`n$createOut"
    }
}

if (-not (Test-Path "node_modules")) { npm install }

Write-Host "Applying D1 migrations (remote) ..."
& "$PSScriptRoot\d1-apply-remote.ps1"
$d1Exit = $LASTEXITCODE
if ($null -ne $d1Exit -and $d1Exit -ne 0) { exit $d1Exit }

$jwt = [string]$env:ROOTMC_JWT_SECRET
if (-not $jwt -or $jwt.Length -lt 16) { $jwt = [string]$env:ROOTRECORD_PRIMARY_JWT_SECRET }
if (-not $jwt -or $jwt.Length -lt 16) {
    $jwtFile = Join-Path $PSScriptRoot ".rootmc-deploy-jwt"
    if (Test-Path $jwtFile) { $jwt = (Get-Content $jwtFile -Raw).Trim() }
}
if (-not $jwt -or $jwt.Length -lt 16) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwt = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "").Replace("/", "")
    Set-Content -LiteralPath (Join-Path $PSScriptRoot ".rootmc-deploy-jwt") -Value $jwt -NoNewline
}
$jwt | npx wrangler secret put JWT_SECRET

$rootmcBot = [string]$env:DISCORD_ROOTMC_BOT_TOKEN
if (-not $rootmcBot) { $rootmcBot = [string]$env:DISCORD_BOT_TOKEN }
$rootmcBot = $rootmcBot.Trim()
if ($rootmcBot -match '^(?i)bot\s+') { $rootmcBot = ($rootmcBot -replace '^(?i)bot\s+', '').Trim() }
if ($rootmcBot.Length -ge 45 -and $rootmcBot.Contains(".")) {
    $rootmcBot | npx wrangler secret put DISCORD_ROOTMC_BOT_TOKEN
    Write-Host "Uploaded DISCORD_ROOTMC_BOT_TOKEN."
}

$mainBot = [string]$env:DISCORD_BOT_TOKEN
$mainBot = $mainBot.Trim()
if ($mainBot -match '^(?i)bot\s+') { $mainBot = ($mainBot -replace '^(?i)bot\s+', '').Trim() }
if ($mainBot.Length -ge 45 -and $mainBot.Contains(".")) {
    $mainBot | npx wrangler secret put DISCORD_BOT_TOKEN
    Write-Host "Uploaded DISCORD_BOT_TOKEN (AI raw archive on business Discord)."
}

$rootmcClientSecret = [string]$env:DISCORD_ROOTMC_CLIENT_SECRET
if (-not $rootmcClientSecret) { $rootmcClientSecret = [string]$env:DISCORD_CLIENT_SECRET }
if ($rootmcClientSecret.Trim().Length -ge 16) {
    $rootmcClientSecret.Trim() | npx wrangler secret put DISCORD_ROOTMC_CLIENT_SECRET
    Write-Host "Uploaded DISCORD_ROOTMC_CLIENT_SECRET."
}

$rootmcWebhook = [string]$env:DISCORD_ROOTMC_WEBHOOK_URL
if (-not $rootmcWebhook) { $rootmcWebhook = [string]$env:DISCORD_FEEDBACK_WEBHOOK_URL }
if (-not $rootmcWebhook) { $rootmcWebhook = [string]$env:DISCORD_GROK_WEBHOOK_URL }
if ($rootmcWebhook -match '^https://discord(app)?\.com/api/webhooks/' -and $rootmcWebhook.Length -gt 60) {
    $rootmcWebhook | npx wrangler secret put DISCORD_ROOTMC_WEBHOOK_URL
    Write-Host "Uploaded DISCORD_ROOTMC_WEBHOOK_URL."
}

$grokChat = [string]$env:GROK_API_BEARER_TOKEN
if (-not $grokChat) { $grokChat = [string]$env:GROK_API_KEY }
foreach ($aliasName in @("XAI_API_KEY", "X_AI_API_KEY")) {
    if ($grokChat.Trim().Length -ge 12) { break }
    $aliasValue = [string](Get-Item -Path "Env:$aliasName" -ErrorAction SilentlyContinue).Value
    if ($aliasValue.Trim().Length -ge 12) {
        $grokChat = $aliasValue
        Write-Host "Using $aliasName for Grok chat bearer upload."
        break
    }
}
if ($grokChat.Trim().Length -ge 12 -and $grokChat.Trim().StartsWith("xai-")) {
    $grokChat.Trim() | npx wrangler secret put GROK_API_BEARER_TOKEN
    Write-Host "Uploaded GROK_API_BEARER_TOKEN (console.x.ai chat, not GROK_X_* social keys)."
} else {
    Write-Warning "No valid Grok chat key (xai-...) in Desktop\RootMC\.env or credentials.env."
}

$fcmPath = [string]$env:FCM_SERVICE_ACCOUNT_JSON_PATH
if (-not $fcmPath) { $fcmPath = [string]$env:FCM_SERVICE_ACCOUNT_JSON_FILE }
if ($fcmPath -and (Test-Path -LiteralPath $fcmPath)) {
    (Get-Content -LiteralPath $fcmPath -Raw) | npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
    Write-Host "Uploaded FCM_SERVICE_ACCOUNT_JSON (shop alert push)."
} else {
    Write-Warning "No FCM_SERVICE_ACCOUNT_JSON_PATH - shop alert push disabled until set."
}

& "$PSScriptRoot\scripts\seed-featured-server.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx wrangler deploy
Write-Host ""
Write-Host "RootMC API: https://api.rootmc.net/"

Write-Host "Syncing cron schedules (Cloudflare API) ..."
& "$PSScriptRoot\scripts\sync-cron-schedules.ps1"
if (-not $?) { exit 1 }

Write-Host "Registering RootMC Discord slash commands ..."
$registerScript = Join-Path (Split-Path $PSScriptRoot -Parent) "rootmc-realm-api\scripts\discord-register-rootmc-commands.mjs"
if (Test-Path $registerScript) {
    $env:ROOTMC_API_URL = "https://api.rootmc.net"
    node $registerScript
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Discord interactions: https://api.rootmc.net/v1/discord/rootmc/interactions"
