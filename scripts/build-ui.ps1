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

  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Get-ChildItem -LiteralPath $target -Force -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }
  Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
  Write-Host "[build-ui] synced apps/$Name/src -> public/$Name"
}

Sync-App -Name "web"
Sync-App -Name "admin"
