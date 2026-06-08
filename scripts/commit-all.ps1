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

function Read-GitConfigUser {
  param([string] $ConfigPath)
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return $null }
  $section = ""
  $name = ""
  $email = ""
  foreach ($raw in Get-Content -LiteralPath $ConfigPath) {
    $line = $raw.Trim()
    if ($line -match '^\[(.+)\]$') { $section = $Matches[1].Trim().ToLower(); continue }
    if ($section -ne "user") { continue }
    if ($line -match '^name\s*=\s*(.+)$') { $name = $Matches[1].Trim() }
    if ($line -match '^email\s*=\s*(.+)$') { $email = $Matches[1].Trim() }
  }
  if ($name -and $email) { return @{ Name = $name; Email = $email } }
  return $null
}

function Get-CommitIdentity {
  $name = [string]$env:GIT_AUTHOR_NAME
  $email = [string]$env:GIT_AUTHOR_EMAIL
  if (-not $name) { $name = [string]$env:GIT_COMMIT_USER_NAME }
  if (-not $email) { $email = [string]$env:GIT_COMMIT_USER_EMAIL }

  if (-not $name -or -not $email) {
    $localName = (& $git config --local user.name 2>$null | Out-String).Trim()
    $localEmail = (& $git config --local user.email 2>$null | Out-String).Trim()
    if ($localName -and $localEmail) {
      $name = $localName
      $email = $localEmail
    }
  }

  if (-not $name -or -not $email) {
    foreach ($cfgPath in @(
      (Join-Path $repoRoot ".gitconfig"),
      (Join-Path $repoRoot "Web\main\.gitconfig")
    )) {
      $parsed = Read-GitConfigUser $cfgPath
      if ($parsed) {
        $name = $parsed.Name
        $email = $parsed.Email
        break
      }
    }
  }

  if (-not $name -or -not $email) {
    $last = (& $git log -1 --format="%an|%ae" 2>$null | Out-String).Trim()
    if ($last -match '^(.+)\|(.+)$') {
      $name = $Matches[1].Trim()
      $email = $Matches[2].Trim()
    }
  }

  if (-not $name -or -not $email) {
    throw @"
Git author identity is not configured for this repo.
Set GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL for this session, or add [user] name/email to .gitconfig at the repo root.
(Does not modify global git config.)
"@
  }

  return @{ Name = $name; Email = $email }
}

function Invoke-GitCommit {
  param(
    [string] $Message,
    [hashtable] $Identity
  )
  Invoke-Git -GitArgs @(
    "-c", "user.name=$($Identity.Name)",
    "-c", "user.email=$($Identity.Email)",
    "commit", "-m", $Message
  )
}

function Test-ProjectRoot {
  param([string] $Dir)
  if (-not (Test-Path -LiteralPath $Dir)) { return $false }
  $markers = @(
    (Join-Path $Dir "package.json"),
    (Join-Path $Dir "wrangler.toml"),
    (Join-Path $Dir "pnpm-workspace.yaml"),
    (Join-Path $Dir "capacitor.config.json"),
    (Join-Path $Dir "requirements.txt"),
    (Join-Path $Dir "pyproject.toml"),
    (Join-Path $Dir "solana.json"),
    (Join-Path $Dir "android\app\build.gradle"),
    (Join-Path $Dir "android\app\build.gradle.kts"),
    (Join-Path $Dir "app\build.gradle"),
    (Join-Path $Dir "app\build.gradle.kts")
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

  function Add-Root([string] $Rel, [switch] $Force) {
    $full = Join-Path $repoRoot $Rel
    if (-not (Test-Path -LiteralPath $full)) { return }
    if ($Force -or (Test-ProjectRoot $full)) {
      [void]$roots.Add($Rel.Replace("\", "/"))
    }
  }

  function Add-RootsUnder([string] $ParentRel) {
    $parent = Join-Path $repoRoot $ParentRel
    if (-not (Test-Path -LiteralPath $parent)) { return }
    Get-ChildItem -Path $parent -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Add-Root ($ParentRel + "\" + $_.Name) }
  }

  Add-Root "Web\main"
  Add-Root "solana-rootrecord-site"
  Add-Root "Mobile"
  Add-Root "Web\cloudflare\shared"

  Add-RootsUnder "Web\apps"
  Add-RootsUnder "Web\tools"
  Add-RootsUnder "Mobile"

  Get-ChildItem -Path (Join-Path $repoRoot "Web\cloudflare") -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Root ("Web\cloudflare\" + $_.Name) }

  Add-RootsUnder "Bots"
  $botsRoot = Join-Path $repoRoot "Bots"
  if (Test-Path -LiteralPath $botsRoot) {
    Get-ChildItem -Path $botsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      Get-ChildItem -Path $_.FullName -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Add-Root ("Bots\" + $_.Parent.Name + "\" + $_.Name) }
    }
  }

  foreach ($extra in @("Doc-Repo", "ebooks", "scripts", "Web\scripts")) {
    Add-Root $extra -Force
  }

  Get-ChildItem -Path $repoRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -notin @(".git", ".cursor", ".wrangler", "node_modules", "Mobile", "Web", "Bots", "scripts")
    } |
    ForEach-Object { Add-Root $_.Name }

  $roots | Sort-Object
}

function Get-ChangedProjects {
  param([string[]] $ProjectRoots)
  $porcelain = & $git status --porcelain 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  $hit = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $repoRootMarker = "(repo root)"
  foreach ($line in $porcelain) {
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3).Trim().Trim('"')
    $norm = $path.Replace("\", "/")
    $matched = $false
    foreach ($root in $ProjectRoots) {
      $prefix = $root.TrimEnd("/") + "/"
      if ($norm -eq $root -or $norm.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        [void]$hit.Add($root)
        $matched = $true
      }
    }
    if (-not $matched -and $norm -notmatch "/") {
      [void]$hit.Add($repoRootMarker)
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

$commitIdentity = Get-CommitIdentity

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
        Invoke-GitCommit -Message $msg -Identity $commitIdentity
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

$secretPattern = '(^|/)(credentials\.env|\.env)$|(^|/)\.deploy-jwt$|\.(jks|p12)$|\.keystore$|firebase-adminsdk.*\.json$|service[-_]?account.*\.json$|(^|/)local\.properties$'
$stagedSecrets = @(& $git diff --cached --name-only 2>$null | Where-Object {
  ($_ -match $secretPattern -and $_ -notmatch "\.example") 
})
if ($stagedSecrets.Count -gt 0) {
  Write-Host ""
  Write-Host "Unstaging secret / local-only paths (will not commit):" -ForegroundColor Yellow
  foreach ($s in $stagedSecrets) {
    Write-Host "  $s" -ForegroundColor Yellow
    Invoke-Git -GitArgs @("reset", "HEAD", "--", $s)
  }
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
Write-Host "Author: $($commitIdentity.Name) <$($commitIdentity.Email)>" -ForegroundColor DarkGray
Invoke-GitCommit -Message $commitMsg -Identity $commitIdentity

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
