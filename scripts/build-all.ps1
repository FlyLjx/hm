param()

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "build-ui.ps1")
& (Join-Path $PSScriptRoot "build-go.ps1")
& (Join-Path $PSScriptRoot "check-release.ps1")
