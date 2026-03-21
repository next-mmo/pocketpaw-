# ----------------------------------------------------------------
# PocketPaw Desktop - Bundle Backend (PowerShell)
#
# Builds the PocketPaw wheel and downloads the standalone uv binary,
# staging both into app-wrapper/resources/backend/ for distribution.
#
# Usage:
#   .\scripts\bundle-backend.ps1              # Auto-detect platform
#   .\scripts\bundle-backend.ps1 -Platform win
# ----------------------------------------------------------------

param(
    [ValidateSet("win", "mac", "mac-x86", "linux")]
    [string]$Platform
)

$ErrorActionPreference = "Stop"

# --- Paths ---
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppWrapper  = Split-Path -Parent $ScriptDir
$ProjectRoot = Split-Path -Parent $AppWrapper
$BackendDir  = Join-Path $AppWrapper "resources\backend"
$UvDir       = Join-Path $BackendDir "uv"

# --- UV Release Config ---
$UvVersion = "0.6.12"
$UvBaseUrl = "https://github.com/astral-sh/uv/releases/download/$UvVersion"

$UvArchives = @{
    "win"     = @{ Archive = "uv-x86_64-pc-windows-msvc.zip";       BinPath = "uv-x86_64-pc-windows-msvc/uv.exe" }
    "mac"     = @{ Archive = "uv-aarch64-apple-darwin.tar.gz";      BinPath = "uv-aarch64-apple-darwin/uv" }
    "mac-x86" = @{ Archive = "uv-x86_64-apple-darwin.tar.gz";      BinPath = "uv-x86_64-apple-darwin/uv" }
    "linux"   = @{ Archive = "uv-x86_64-unknown-linux-musl.tar.gz"; BinPath = "uv-x86_64-unknown-linux-musl/uv" }
}

# --- Auto-detect platform ---
if (-not $Platform) {
    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        $Platform = "win"
    } elseif ($IsMacOS) {
        $arch = uname -m
        if ($arch -eq "arm64") { $Platform = "mac" } else { $Platform = "mac-x86" }
    } else {
        $Platform = "linux"
    }
}

Write-Host ""
Write-Host "  [BUILD] Bundling PocketPaw backend for: $Platform" -ForegroundColor Cyan
Write-Host "  [DIR]   Output: $BackendDir" -ForegroundColor DarkGray
Write-Host ""

# --- Step 0: Clean old artifacts ---
Write-Host "  [CLEAN] Removing old artifacts..."
Get-ChildItem -Path $BackendDir -Exclude ".gitignore" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
if (-not (Test-Path $BackendDir)) { New-Item -ItemType Directory -Path $BackendDir -Force | Out-Null }

# --- Step 1: Build wheel ---
Write-Host "  [WHEEL] Building wheel..."

# Find uv binary - check PATH first, then common install locations
$uvCmd = $null
if (Get-Command uv -ErrorAction SilentlyContinue) {
    $uvCmd = (Get-Command uv).Source
} else {
    $homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { [Environment]::GetFolderPath("UserProfile") }
    $candidates = @(
        (Join-Path $homeDir ".local" "bin" "uv.exe"),
        (Join-Path $homeDir ".cargo" "bin" "uv.exe")
    )
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA "uv" "uv.exe")
    }
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $uvCmd = $c
            Write-Host "  [INFO]  Found uv at: $uvCmd" -ForegroundColor DarkGray
            break
        }
    }
}

Push-Location $ProjectRoot

$buildSuccess = $false

if ($uvCmd) {
    Write-Host "  [INFO]  Using uv: $uvCmd" -ForegroundColor DarkGray
    $buildProc = Start-Process -FilePath $uvCmd -ArgumentList "build","--wheel","--out-dir",$BackendDir -NoNewWindow -PassThru -Wait
    if ($buildProc.ExitCode -eq 0) {
        $buildSuccess = $true
    } else {
        Write-Host "  [WARN]  uv build exited with code $($buildProc.ExitCode)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [WARN]  uv not found in PATH or common locations" -ForegroundColor Yellow
}

if (-not $buildSuccess) {
    Write-Host "  [INFO]  Trying python -m build..." -ForegroundColor DarkGray
    try {
        & python -m build --wheel --outdir "$BackendDir" 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) { throw "build failed" }
    } catch {
        Write-Host "  [FAIL]  Could not build wheel. Install uv or python-build." -ForegroundColor Red
        Pop-Location
        exit 1
    }
}
Pop-Location

# Find the wheel
$wheel = Get-ChildItem -Path $BackendDir -Filter "pocketpaw-*.whl" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $wheel) {
    Write-Host "  [FAIL]  No wheel file produced!" -ForegroundColor Red
    exit 1
}

# Remove older wheels if any
Get-ChildItem -Path $BackendDir -Filter "pocketpaw-*.whl" | Where-Object { $_.Name -ne $wheel.Name } | Remove-Item -Force

$sizeMB = [math]::Round($wheel.Length / 1MB, 1)
Write-Host "  [OK]    Wheel: $($wheel.Name) ($sizeMB MB)" -ForegroundColor Green

# --- Step 2: Download uv binary ---
$archiveInfo = $UvArchives[$Platform]
$archiveUrl  = "$UvBaseUrl/$($archiveInfo.Archive)"
$archiveDest = Join-Path $env:TEMP $archiveInfo.Archive

Write-Host "  [DL]    Downloading uv $UvVersion for $Platform..."
Write-Host "          $archiveUrl" -ForegroundColor DarkGray

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $archiveUrl -OutFile $archiveDest -UseBasicParsing

if (-not (Test-Path $UvDir)) { New-Item -ItemType Directory -Path $UvDir -Force | Out-Null }

if ($archiveInfo.Archive.EndsWith(".zip")) {
    $extractDir = Join-Path $env:TEMP "uv-extract"
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    Expand-Archive -Path $archiveDest -DestinationPath $extractDir -Force
    $binName = Split-Path -Leaf $archiveInfo.BinPath
    $srcBin  = Join-Path $extractDir $archiveInfo.BinPath
    Copy-Item -Path $srcBin -Destination (Join-Path $UvDir $binName) -Force
    Remove-Item -Recurse -Force $extractDir
} else {
    $extractDir = Join-Path $env:TEMP "uv-extract"
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    & tar -xzf $archiveDest -C $extractDir
    $binName = Split-Path -Leaf $archiveInfo.BinPath
    $srcBin  = Join-Path $extractDir $archiveInfo.BinPath
    Copy-Item -Path $srcBin -Destination (Join-Path $UvDir $binName) -Force
    Remove-Item -Recurse -Force $extractDir
}

Remove-Item -Force $archiveDest -ErrorAction SilentlyContinue

$uvBin = Get-ChildItem -Path $UvDir | Select-Object -First 1
$uvSizeMB = [math]::Round($uvBin.Length / 1MB, 1)
Write-Host "  [OK]    uv binary: $($uvBin.FullName) ($uvSizeMB MB)" -ForegroundColor Green

# --- Summary ---
Write-Host ""
Write-Host "  [DONE]  Backend bundle ready!" -ForegroundColor Green
Write-Host "          Wheel: $($wheel.Name)"
Write-Host "          UV:    $($uvBin.FullName)"
Write-Host "          Dir:   $BackendDir"
Write-Host ""
Write-Host "  Next: npm run release:win (or :mac / :linux)" -ForegroundColor Cyan
Write-Host ""
