param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[dev] syncing static files..."
& (Join-Path $repoRoot "scripts\build-ui.ps1")

Write-Host "[dev] starting hot reload server..."
& (Join-Path $repoRoot "scripts\dev-go-watch.ps1") -Port $Port
