param(
  [string]$AppDir = "C:\ai-pai",
  [int]$AppPublicPort = 6986,
  [string]$Image = "ghcr.io/flyljx/ai-pai:latest",
  [string]$PostgresImage = "postgres:16",
  [string]$DbName = "ai_pai",
  [string]$DbUser = "ai_pai",
  [string]$DbPassword = ""
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[ai-pai] $Message"
}

function New-Password {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).Replace("/", "_").Replace("+", "-").TrimEnd("=")
}

docker compose version | Out-Null

$oldContainers = docker ps -a --format "{{.Names}}" | Where-Object { $_ -in @("aipi-go", "aipi-postgres") }
if ($oldContainers.Count -gt 0) {
  Write-Step "Old containers aipi-go/aipi-postgres were detected and will be kept untouched."
  Write-Step "The new ai-pai service uses port $AppPublicPort by default so both versions can run during migration."
}

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "logs") | Out-Null

$envPath = Join-Path $AppDir ".env"
if (!$DbPassword -and (Test-Path $envPath)) {
  $existing = Select-String -Path $envPath -Pattern "^DB_PASSWORD=(.*)$" | Select-Object -First 1
  if ($existing) {
    $DbPassword = $existing.Matches[0].Groups[1].Value.Trim('"')
  }
}
if (!$DbPassword) {
  $DbPassword = New-Password
}

Write-Step "Writing deployment files in $AppDir"
@"
PROJECT_NAME=ai-pai
APP_PUBLIC_PORT=$AppPublicPort
IMAGE=$Image
POSTGRES_IMAGE=$PostgresImage
DB_NAME=$DbName
DB_USER=$DbUser
DB_PASSWORD=$DbPassword
TZ=Asia/Shanghai
"@ | Set-Content -Encoding UTF8 -Path $envPath

@"
name: `${PROJECT_NAME:-ai-pai}

services:
  postgres:
    image: `${POSTGRES_IMAGE:-postgres:16}
    container_name: ai-pai-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: `${DB_NAME:-ai_pai}
      POSTGRES_USER: `${DB_USER:-ai_pai}
      POSTGRES_PASSWORD: `${DB_PASSWORD}
      TZ: `${TZ:-Asia/Shanghai}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U `${DB_USER:-ai_pai} -d `${DB_NAME:-ai_pai}"]
      interval: 5s
      timeout: 5s
      retries: 20

  ai-pai:
    image: `${IMAGE:-ghcr.io/flyljx/ai-pai:latest}
    container_name: ai-pai
    restart: unless-stopped
    environment:
      TZ: `${TZ:-Asia/Shanghai}
      DB_DRIVER: postgres
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: `${DB_USER:-ai_pai}
      DB_PASSWORD: `${DB_PASSWORD}
      DB_NAME: `${DB_NAME:-ai_pai}
      DB_SSLMODE: disable
      SERVE_STATIC: "true"
      PUBLIC_DIR: public
      LOG_DIR: logs
      PORT: 3001
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "`${APP_PUBLIC_PORT:-6986}:3001"
    volumes:
      - ./logs:/app/logs

volumes:
  postgres_data:
"@ | Set-Content -Encoding UTF8 -Path (Join-Path $AppDir "docker-compose.yml")

Push-Location $AppDir
try {
  Write-Step "Pulling images..."
  docker compose pull
  Write-Step "Starting services..."
  docker compose up -d
}
finally {
  Pop-Location
}

Write-Step "Deployment complete."
Write-Step "URL: http://127.0.0.1:$AppPublicPort"
Write-Step "App logs: docker compose logs -f ai-pai"
Write-Step "Old containers are not removed by this script. After your 7-day migration window, remove them manually if needed."
