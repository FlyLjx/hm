param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Sync-App {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $source = Join-Path $repoRoot "apps\$Name\src"
  $target = Join-Path $repoRoot "public\$Name"

  if (!(Test-Path $source)) {
    throw "Missing source directory: $source"
  }

  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
  Write-Host "[build-ui] synced apps/$Name/src -> public/$Name"
}

Sync-App -Name "web"
Sync-App -Name "admin"
