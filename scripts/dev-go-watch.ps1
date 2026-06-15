param(
  [int]$Port = 3001,
  [string]$Bin = ".tmp\aipi-go-dev.exe"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$goRoot = Join-Path $repoRoot "go-server"
$goExe = "go"

function Test-PortAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [int]$CandidatePort
  )

  $listener = Get-NetTCPConnection -LocalPort $CandidatePort -State Listen -ErrorAction SilentlyContinue
  return $null -eq $listener
}

function Resolve-DevPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$PreferredPort
  )

  for ($candidate = $PreferredPort; $candidate -lt ($PreferredPort + 20); $candidate++) {
    if (Test-PortAvailable -CandidatePort $candidate) {
      return $candidate
    }
  }

  throw "No available dev port found from $PreferredPort to $($PreferredPort + 19)."
}

$resolvedPort = Resolve-DevPort -PreferredPort $Port
if ($resolvedPort -ne $Port) {
  Write-Host "[dev:go] port $Port is busy; using $resolvedPort instead."
}

$localGo = Join-Path $repoRoot ".vendor\go\bin\go.exe"
if (Test-Path $localGo) {
  $goExe = $localGo
}
elseif (Test-Path "C:\Program Files\Go\bin\go.exe") {
  $goExe = "C:\Program Files\Go\bin\go.exe"
}

$airExe = Join-Path $repoRoot ".tmp\bin\air.exe"
if (!(Test-Path $airExe)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $airExe) | Out-Null
  Write-Host "[dev:go] installing air hot reload tool..."
  $env:GOBIN = Split-Path -Parent $airExe
  $env:GOPROXY = if ($env:GOPROXY) { $env:GOPROXY } else { "https://goproxy.cn,direct" }
  & $goExe install github.com/air-verse/air@latest
}

$binPath = Join-Path $repoRoot $Bin
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $binPath) | Out-Null
$airConfigPath = Join-Path $repoRoot ".tmp\air-go.toml"
$relativeBinPath = "../.tmp/aipi-go-dev.exe"
$goCommand = $goExe.Replace("\", "/")
$airConfig = @"
root = "."
tmp_dir = "tmp"

[build]
cmd = "$goCommand build -o $relativeBinPath ./cmd/aipi-go"
entrypoint = "$relativeBinPath"
include_ext = ["go", "tpl", "tmpl", "html"]
exclude_dir = ["tmp", "vendor", ".git"]
delay = 500
stop_on_error = true
send_interrupt = true
kill_delay = "500ms"

[log]
time = true

[misc]
clean_on_exit = true
"@
$airConfig | Set-Content -Encoding UTF8 -Path $airConfigPath

$env:PORT = [string]$resolvedPort
$env:SERVE_STATIC = if ($env:SERVE_STATIC) { $env:SERVE_STATIC } else { "true" }
$env:PUBLIC_DIR = if ($env:PUBLIC_DIR) { $env:PUBLIC_DIR } else { Join-Path $repoRoot "public" }
$env:LOG_DIR = if ($env:LOG_DIR) { $env:LOG_DIR } else { Join-Path $repoRoot "logs" }

Push-Location $goRoot
try {
  & $airExe -c $airConfigPath
}
finally {
  Pop-Location
}
