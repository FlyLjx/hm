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
