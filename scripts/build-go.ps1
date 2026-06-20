param(
  [string]$Output = "release/aipi-go.exe",
  [switch]$Run
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$goRoot = Join-Path $repoRoot "go-server"
$goExe = "go"
$localGo = Join-Path $repoRoot ".vendor\go\bin\go.exe"
if (Test-Path $localGo) {
  $goExe = $localGo
}
elseif (Test-Path "C:\Program Files\Go\bin\go.exe") {
  $goExe = "C:\Program Files\Go\bin\go.exe"
}

Push-Location $goRoot
try {
  $env:GOPROXY = if ($env:GOPROXY) { $env:GOPROXY } else { "https://goproxy.cn,direct" }
  $env:DB_DRIVER = if ($env:DB_DRIVER) { $env:DB_DRIVER } else { "postgres" }
  $env:DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "127.0.0.1" }
  $env:DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
  $env:DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "aipi" }
  $env:DB_PASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "aipi_change_me" }
  $env:DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "aipi" }
  $env:DB_SSLMODE = if ($env:DB_SSLMODE) { $env:DB_SSLMODE } else { "disable" }
  & $goExe mod tidy
  $outputPath = Join-Path $repoRoot $Output
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
  & $goExe build -ldflags "-s -w" -o $outputPath ./cmd/aipi-go
  Write-Host "Built $outputPath"
  if ($Run) {
    & $outputPath
  }
}
finally {
  Pop-Location
}
