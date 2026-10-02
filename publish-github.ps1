<#
publish-github.ps1 - one-click publish of dsh-zh-review-guard to GitHub.

What it does:
  1. verify git + gh, and that `gh auth status` passes
  2. verify the tgz exists, is non-empty, and compute its SHA256
  3. git init -b main (if needed), set a repo-local commit identity, commit everything
  4. create the public repo (or reuse it), push main
  5. create the release and attach the tgz
  6. download the attached tgz back and compare SHA256 with the local file

Usage:
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
  & .\publish-github.ps1 -Owner <github-login> -Tgz <path\to>\dsh-zh-review-guard-0.1.0.tgz

Optional parameters:
  -Repo dsh-zh-review-guard   repository name
  -Visibility public|private  default public
  -Tag v0.2.1                 release tag; also drives the default commit message and release title
  -Notes RELEASE-NOTES-v0.2.1.md   release body file (relative to this script)
  -Title "..."                release title (default "<Tag> - dsh-zh-review-guard")
  -CommitMessage "..."        commit message (default "release: <Tag> - dsh-zh-review-guard (...)")
  -GitName / -GitEmail        repo-local commit identity; derived from the gh account when omitted
  -Proxy http://<host>:<port>  set HTTP(S)_PROXY for gh and git (only if your network needs it)
  -NoPush                     local init + commit only
  -NoRelease                  create/push the repo but skip the release
  -NoRewrite                  neutralise a global github.com URL rewrite for this run

Host notes:
  * Written for Windows PowerShell 5.1 on a CP936 host, so this script is
    deliberately pure ASCII (it parses identically under CP936 and UTF-8).
  * -Proxy / -NoRewrite exist because gh (Go) ignores proxies that are configured
    only in the WinINET system settings, and a URL-rewriting mirror in .gitconfig
    can break the credential-helper handshake.
  * The script never modifies your global .gitconfig.

Exit code: 0 = success, 1 = failure.
#>
param(
  [Parameter(Mandatory = $true)][string]$Owner,
  [string]$Repo = 'dsh-zh-review-guard',
  [Parameter(Mandatory = $true)][string]$Tgz,
  [ValidateSet('public', 'private')][string]$Visibility = 'public',
  [string]$Tag = 'v0.1.0',
  [string]$Notes = 'RELEASE-NOTES-v0.1.0.md',
  [string]$Title = '',            # release title; defaults to "<Tag> - dsh-zh-review-guard"
  [string]$CommitMessage = '',    # commit message; defaults to "release: <Tag> ..."
  [string]$GitName = '',
  [string]$GitEmail = '',
  [string]$Proxy = '',
  [switch]$NoPush,
  [switch]$NoRelease,
  [switch]$NoRewrite
)
$ErrorActionPreference = 'Continue'

function Fail([string]$msg) {
  Write-Host "FATAL: $msg" -ForegroundColor Red
  exit 1
}
function Require-Cmd([string]$n) {
  $p = Get-Command $n -ErrorAction SilentlyContinue
  if (-not $p) { Fail "missing command: $n" }
  return $p.Source
}

if ($Proxy) {
  $env:HTTP_PROXY = $Proxy
  $env:HTTPS_PROXY = $Proxy
  Write-Host "proxy set for gh/git: $Proxy"
}

$here = $PSScriptRoot
if (-not $here) { $here = (Get-Location).Path }
Write-Host "== repo dir: $here"

$git = Require-Cmd git
Write-Host "git -> $git"

$gh = $null
if (-not $NoPush) {
  $gh = Require-Cmd gh
  Write-Host "gh -> $gh"
  & gh auth status 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail 'gh is not logged in (run: gh auth login)' }
}

if (-not (Test-Path $Tgz)) { Fail "tgz not found: $Tgz" }
$tgzInfo = Get-Item $Tgz
if ($tgzInfo.Length -le 0) { Fail "tgz is empty: $Tgz" }
$sha = (Get-FileHash $Tgz -Algorithm SHA256).Hash
Write-Host "tgz: $($tgzInfo.FullName)"
Write-Host "     $($tgzInfo.Length) bytes"
Write-Host "     sha256=$sha"

Set-Location $here

if (-not (Test-Path (Join-Path $here '.git'))) {
  & git init -b main 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail 'git init failed' }
  Write-Host 'local repo initialised on branch main'
} else {
  Write-Host '.git already present, skip init'
}

if (-not $GitName -or -not $GitEmail) {
  $login = $Owner
  if ($gh) {
    $api = & gh api user --jq .login 2>$null
    if ($LASTEXITCODE -eq 0 -and $api) { $login = "$api".Trim() }
  }
  if (-not $GitName) { $GitName = $login }
  if (-not $GitEmail) { $GitEmail = "$login@users.noreply.github.com" }
}
& git config user.name $GitName
& git config user.email $GitEmail
Write-Host "repo-local commit identity: $GitName <$GitEmail>"

& git add -A
& git -c core.pager=cat status --short | Out-Host
if (-not $CommitMessage) { $CommitMessage = "release: $Tag - dsh-zh-review-guard (per-session guard: visible reasoning + Simplified Chinese)" }
& git -c core.pager=cat commit -m $CommitMessage 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host 'commit returned non-zero (nothing to commit?) - continuing' -ForegroundColor Yellow }

if ($NoPush) {
  Write-Host ''
  Write-Host 'NoPush: local repo + commit done. Manual push:' -ForegroundColor Yellow
  Write-Host "  gh repo create $Owner/$Repo --$Visibility --source `"$here`" --remote origin --push"
  exit 0
}

$notesPath = Join-Path $here $Notes
$full = "$Owner/$Repo"
$url = "https://github.com/$full.git"

if ($NoRewrite) {
  # Temporary global config: drop the ghfast.top URL rewrite but KEEP the gh
  # credential helper, otherwise push cannot authenticate.
  $cfg = Join-Path $env:TEMP 'gitcfg-publish-nowrite'
  $ghEscaped = $gh.Replace('\', '\\')
  $lines = @(
    '[safe]',
    "`tdirectory = *",
    '[credential "https://github.com"]',
    "`thelper = ",
    "`thelper = !'$ghEscaped' auth git-credential"
  )
  $lines | Set-Content -Path $cfg -Encoding ASCII
  $env:GIT_CONFIG_GLOBAL = $cfg
  Write-Host "GIT_CONFIG_GLOBAL neutralised (no ghfast rewrite, gh helper kept): $cfg" -ForegroundColor Yellow
  Get-Content $cfg | Out-Host
}

$exists = $false
& gh repo view $full --json name 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $exists = $true }

if ($exists) {
  Write-Host "remote repo already exists: $full - add remote and push" -ForegroundColor Yellow
  $remotes = & git remote
  if ($remotes -contains 'origin') { & git remote set-url origin $url } else { & git remote add origin $url }
  & git -c core.pager=cat push -u origin main 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail 'git push failed' }
} else {
  & gh repo create $full --$Visibility --source $here --remote origin --push 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail 'gh repo create failed' }
}

if ($NoRelease) { Write-Host 'NoRelease: repo pushed, release skipped'; exit 0 }
if (-not (Test-Path $notesPath)) { Fail "notes file not found: $notesPath" }

Write-Host "== create release $Tag =="
if (-not $Title) { $Title = "$Tag - dsh-zh-review-guard" }
& gh release create $Tag $Tgz --title $Title --notes-file $notesPath 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'gh release create failed' }

Write-Host '== verify: list assets, then re-download the tgz =='
& gh release view $Tag --json tagName,url,assets 2>&1 | Out-Host
$dl = Join-Path $env:TEMP ("ghrel-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $dl | Out-Null
& gh release download $Tag --dir $dl --clobber 2>&1 | Out-Host
$got = Get-ChildItem $dl -File | Where-Object { $_.Name -like '*.tgz' } | Select-Object -First 1
if (-not $got) { Fail 'could not download the tgz back from the release' }
$shaGot = (Get-FileHash $got.FullName -Algorithm SHA256).Hash
Write-Host "local  sha256=$sha"
Write-Host "remote sha256=$shaGot"
if ($shaGot -eq $sha) { Write-Host 'OK: release asset matches the local tgz byte for byte' -ForegroundColor Green }
else { Fail 'release asset differs from the local tgz' }
exit 0
