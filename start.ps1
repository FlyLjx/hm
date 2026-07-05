$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[start] syncing static files..."
& (Join-Path $repoRoot "scripts\build-ui.ps1")

Write-Host "[start] building go server..."
& (Join-Path $repoRoot "scripts\build-go.ps1")

Write-Host "[start] checking release files..."
& (Join-Path $repoRoot "scripts\check-release.ps1")

Write-Host "[start] launching server..."
& (Join-Path $repoRoot "release\ai-pai.exe")
