# Attach rootmc.net: Cloudflare Dashboard > Pages > rootmc-web > Custom domains
# Preview: https://rootmc-web.pages.dev
# Deploy: powershell -File deploy.ps1
$ErrorActionPreference = "Stop"

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

$repoCred = Join-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent) "credentials.env"
Import-DotEnvFile $repoCred -SkipCloudflareKeys
foreach ($envPath in @(
    "C:\Users\rrdeveloper\Desktop\RootMC - Current\_local\.env",
    "C:\Users\rrdeveloper\Desktop\RootMC - Current\.env"
)) {
    Import-DotEnvFile $envPath
}

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
node scripts/build.mjs

$project = "rootmc-web"
Write-Host "Deploying Pages project $project to RootMC account ..."

$projList = (npx wrangler pages project list 2>&1) | Out-String
if ($projList -notmatch $project) {
    Write-Host "Creating Pages project $project ..."
    npx wrangler pages project create $project --production-branch main 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

npx wrangler pages deploy build `
    --project-name $project `
    --branch main `
    --commit-dirty=true 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Attach custom domain rootmc.net in Cloudflare Dashboard: Pages > rootmc-web > Custom domains."
