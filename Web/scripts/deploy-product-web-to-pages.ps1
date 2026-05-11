param(
  [Parameter(Mandatory = $true)][string]$ProjectName,
  [switch]$SkipBuild
)
# Deploy a mobile app CRA build/ folder to Cloudflare Pages (one project per product).
# Run from the app frontend directory (e.g. weather-manager-mobile/frontend).
# Loads credentials.env walking up from this script and from cwd, plus ancestor/Web/credentials.env.
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Import-DotEnvFile([string]$LiteralPath) {
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return }
  Get-Content -LiteralPath $LiteralPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $p = $line.IndexOf("=")
    if ($p -gt 0) {
      $k = $line.Substring(0, $p).Trim()
      $v = $line.Substring($p + 1).Trim()
      if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path "Env:$k" -Value $v
    }
  }
}

function Collect-AncestorDirs([string]$Start) {
  $dirs = @()
  $probe = $Start
  for ($i = 0; $i -le 20; $i++) {
    $dirs += $probe
    $parent = Split-Path $probe -Parent
    if (-not $parent -or $parent -eq $probe) { break }
    $probe = $parent
  }
  return $dirs
}

$dirSet = @{}
foreach ($root in @($PSScriptRoot, (Get-Location).Path)) {
  foreach ($d in Collect-AncestorDirs $root) {
    $dirSet[$d] = $true
  }
}

$files = @()
foreach ($d in $dirSet.Keys) {
  foreach ($name in @("credentials.env.txt", "credentials.env")) {
    $full = Join-Path $d $name
    if (Test-Path -LiteralPath $full) { $files += $full }
    $webNested = Join-Path (Join-Path $d "Web") $name
    if (Test-Path -LiteralPath $webNested) { $files += $webNested }
  }
}
$files = $files | Select-Object -Unique

if ($files.Count -eq 0) {
  throw "No credentials.env or credentials.env.txt found (walked ancestors of script + cwd, including Web/)."
}

foreach ($f in $files) {
  Import-DotEnvFile $f
}

if ($env:CLOUDFLARE_GLOBAL_API_KEY -and -not $env:CLOUDFLARE_API_KEY) {
  Set-Item -Path "Env:CLOUDFLARE_API_KEY" -Value $env:CLOUDFLARE_GLOBAL_API_KEY
}

$hasToken = $env:CLOUDFLARE_API_TOKEN -and $env:CLOUDFLARE_API_TOKEN.Length -ge 10
$hasGlobal = $env:CLOUDFLARE_API_KEY -and $env:CLOUDFLARE_API_KEY.Length -ge 10 -and $env:CLOUDFLARE_EMAIL -and $env:CLOUDFLARE_EMAIL.Length -gt 3
if (-not $hasToken -and -not $hasGlobal) {
  throw "Set CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_KEY in a credentials file (merged from: $($files -join ', '))."
}

$frontendRoot = (Get-Location).Path
$buildDir = Join-Path $frontendRoot "build"
# Always run a production build when not -SkipBuild — otherwise stale build/ can be uploaded after code edits.
if (-not $SkipBuild) {
  Write-Host "Building SPA (react-scripts)..."
  pnpm run build
}

if (-not (Test-Path (Join-Path $buildDir "index.html"))) {
  throw "Build output missing: $buildDir\index.html"
}

$analyticsEnvByProject = @{
  "rootrecord-weather-web"   = "CF_WEB_ANALYTICS_TOKEN_WEATHER"
  "rootrecord-business-web"  = "CF_WEB_ANALYTICS_TOKEN_BUSINESS"
  "rootrecord-account-web"   = "CF_WEB_ANALYTICS_TOKEN_ACCOUNT"
  "rootrecord-token-web"     = "CF_WEB_ANALYTICS_TOKEN_TOKEN"
  "rootrecord-kilauea-web"   = "CF_WEB_ANALYTICS_TOKEN_KILAUEA"
}
$analyticsVar = $analyticsEnvByProject[$ProjectName]
if ($analyticsVar) {
  $analyticsTok = [Environment]::GetEnvironmentVariable($analyticsVar, "Process")
  if ($analyticsTok -and $analyticsTok.Length -ge 8) {
    $injectScript = Join-Path $PSScriptRoot "inject-cf-web-analytics.ps1"
    if (Test-Path -LiteralPath $injectScript) {
      & $injectScript -BuildRoot $buildDir -Token $analyticsTok
    }
  }
}

npx wrangler pages deploy build --project-name=$ProjectName @args
