# commit-all.ps1 - stage, commit, and push the MonoRepo (all projects in one git tree).
# Discovers project roots dynamically so new apps/workers are included without editing this script.
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $CommitMessageParts
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$git = $env:ProgramFiles + "\Git\bin\git.exe"
if (-not (Test-Path -LiteralPath $git)) { $git = "git" }

function Invoke-Git {
  param([string[]] $GitArgs)
  & $git @GitArgs
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed ($LASTEXITCODE)" }
}

function Test-ProjectRoot {
  param([string] $Dir)
  if (-not (Test-Path -LiteralPath $Dir)) { return $false }
  $markers = @(
    (Join-Path $Dir "package.json"),
    (Join-Path $Dir "wrangler.toml"),
    (Join-Path $Dir "android\app\build.gradle"),
    (Join-Path $Dir "android\app\build.gradle.kts"),
    (Join-Path $Dir "app\build.gradle.kts"),
    (Join-Path $Dir "pnpm-workspace.yaml")
  )
  foreach ($m in $markers) {
    if (Test-Path -LiteralPath $m) { return $true }
  }
  return $false
}

function Get-NestedGitRepos {
  $rootGit = Join-Path $repoRoot ".git"
  Get-ChildItem -Path $repoRoot -Filter ".git" -Recurse -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $rootGit -and $_.Name -eq ".git" } |
    ForEach-Object { $_.Parent.FullName }
}

function Get-MonoRepoProjectRoots {
  $roots = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

  function Add-Root([string] $Rel) {
    $full = Join-Path $repoRoot $Rel
    if ((Test-Path -LiteralPath $full) -and (Test-ProjectRoot $full)) {
      [void]$roots.Add($Rel.Replace("\", "/"))
    }
  }

  Add-Root "Web\main"
  Add-Root "solana-rootrecord-site"
  Add-Root "Web\cloudflare\shared"

  Get-ChildItem -Path (Join-Path $repoRoot "Web\apps") -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Root ("Web\apps\" + $_.Name) }

  Get-ChildItem -Path (Join-Path $repoRoot "Web\cloudflare") -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^(rootrecord-|rr-)" } |
    ForEach-Object { Add-Root ("Web\cloudflare\" + $_.Name) }

  Get-ChildItem -Path (Join-Path $repoRoot "Mobile") -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Root ("Mobile\" + $_.Name) }

  Get-ChildItem -Path (Join-Path $repoRoot "Bots") -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Root ("Bots\" + $_.Name) }

  foreach ($extra in @("Doc-Repo", "ebooks", "Web\tools")) {
    Add-Root $extra
  }

  Get-ChildItem -Path $repoRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -notin @(".git", ".cursor", ".wrangler", "node_modules", "Mobile", "Web", "Bots")
    } |
    ForEach-Object { Add-Root $_.Name }

  $roots | Sort-Object
}

function Get-ChangedProjects {
  param([string[]] $ProjectRoots)
  $porcelain = & $git status --porcelain 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  $hit = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($line in $porcelain) {
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3).Trim().Trim('"')
    $norm = $path.Replace("\", "/")
    foreach ($root in $ProjectRoots) {
      $prefix = $root.TrimEnd("/") + "/"
      if ($norm -eq $root -or $norm.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        [void]$hit.Add($root)
      }
    }
  }
  $hit | Sort-Object
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host " RootRecord MonoRepo - commit all" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"
Write-Host ""

$projectRoots = @(Get-MonoRepoProjectRoots)
Write-Host "Known project roots ($($projectRoots.Count)):" -ForegroundColor DarkGray
foreach ($p in $projectRoots) { Write-Host "  - $p" }

$nested = @(Get-NestedGitRepos)
if ($nested.Count -gt 0) {
  Write-Host ""
  Write-Host "Nested git repos ($($nested.Count)) - commit inside each first:" -ForegroundColor Yellow
  foreach ($nestedRoot in $nested) {
    $rel = $nestedRoot
    if ($nestedRoot.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
      $rel = $nestedRoot.Substring($repoRoot.Length).TrimStart("\", "/")
    }
    Write-Host "  - $rel"
    Push-Location $nestedRoot
    try {
      & $git add -A 2>&1 | Out-Null
      & $git diff --cached --quiet 2>$null
      if ($LASTEXITCODE -ne 0) {
        $msg = if ($CommitMessageParts.Count -gt 0) { $CommitMessageParts -join " " } else { "chore: sync workspace" }
        Invoke-Git -GitArgs @("commit", "-m", $msg)
        Write-Host "    committed." -ForegroundColor Green
      } else {
        Write-Host "    nothing to commit." -ForegroundColor DarkGray
      }
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
$changedProjects = @(Get-ChangedProjects -ProjectRoots $projectRoots)
if ($changedProjects.Count -gt 0) {
  Write-Host "Projects with pending changes:" -ForegroundColor Cyan
  foreach ($p in $changedProjects) { Write-Host "  * $p" }
} else {
  Write-Host "No file changes under discovered project roots (may still have other repo files)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Staging all tracked + untracked files (git add -A)..." -ForegroundColor Cyan
Invoke-Git -GitArgs @("add", "-A")

$stagedSecrets = @(& $git diff --cached --name-only 2>$null | Where-Object {
  $_ -match "(^|/)(credentials\.env|\.env)$" -and $_ -notmatch "\.example"
})
if ($stagedSecrets.Count -gt 0) {
  Write-Host ""
  Write-Host "ERROR: Refusing to commit - secrets staged:" -ForegroundColor Red
  foreach ($s in $stagedSecrets) { Write-Host "  $s" -ForegroundColor Red }
  exit 1
}

& $git diff --cached --quiet 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Nothing to commit." -ForegroundColor Green
  exit 0
}

$commitMsg = if ($CommitMessageParts.Count -gt 0) {
  $CommitMessageParts -join " "
} else {
  "chore: sync workspace"
}

Write-Host "Committing: $commitMsg" -ForegroundColor Cyan
Invoke-Git -GitArgs @("commit", "-m", $commitMsg)

Write-Host ""
Write-Host "Pushing to origin..." -ForegroundColor Cyan
& $git remote get-url origin 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "No origin remote - push skipped." -ForegroundColor Yellow
  exit 0
}

Invoke-Git -GitArgs @("push")
Write-Host ""
Write-Host "Done." -ForegroundColor Green
exit 0
