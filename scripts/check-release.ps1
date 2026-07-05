param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredPaths = @(
  "release/ai-pai.exe",
  "public/web/index.html",
  "public/admin/index.html",
  "public/vendor/vue/vue.global.prod.min.js"
)

$missing = @()
foreach ($relativePath in $requiredPaths) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (!(Test-Path $fullPath)) {
    $missing += $relativePath
  }
}

if ($missing.Count -gt 0) {
  $message = "Release is incomplete. Missing:`n- $($missing -join "`n- ")`n`nRun scripts\build-ui.ps1 and scripts\build-go.ps1, then upload release/ai-pai.exe, public, and .env to the server root."
  Write-Error $message
}

Write-Host 'Release check passed.'
