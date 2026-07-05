#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-ai-pai}"
APP_DIR="${APP_DIR:-/opt/ai-pai}"
APP_PUBLIC_PORT="${APP_PUBLIC_PORT:-6986}"
IMAGE="${IMAGE:-ghcr.io/flyljx/ai-pai:latest}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16}"
DB_NAME="${DB_NAME:-ai_pai}"
DB_USER="${DB_USER:-ai_pai}"
DB_PASSWORD="${DB_PASSWORD:-}"

log() {
  printf '[ai-pai] %s\n' "$*"
}

fail() {
  printf '[ai-pai] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

generate_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 36 | tr '/+' '_-' | tr -d '\n' | cut -c1-32
    return
  fi
  date +%s%N | sha256sum | cut -c1-32
}

read_env_value() {
  local key="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2- | sed 's/^"//;s/"$//'
}

require_command docker
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is required"

if [ "$(id -u)" != "0" ]; then
  log "Running as non-root user. Make sure this user can access Docker."
fi

if docker ps -a --format '{{.Names}}' | grep -Eq '^(aipi-go|aipi-postgres)$'; then
  log "Old containers aipi-go/aipi-postgres were detected and will be kept untouched."
  log "The new ai-pai service uses port ${APP_PUBLIC_PORT} by default so both versions can run during migration."
fi

mkdir -p "$APP_DIR/logs"
cd "$APP_DIR"

if [ -f ".env" ]; then
  existing_password="$(read_env_value DB_PASSWORD .env || true)"
  if [ -z "$DB_PASSWORD" ] && [ -n "$existing_password" ]; then
    DB_PASSWORD="$existing_password"
  fi
fi

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD="$(generate_password)"
fi

log "Writing deployment files in ${APP_DIR}"
cat > .env <<EOF
PROJECT_NAME=${PROJECT_NAME}
APP_PUBLIC_PORT=${APP_PUBLIC_PORT}
IMAGE=${IMAGE}
POSTGRES_IMAGE=${POSTGRES_IMAGE}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
TZ=Asia/Shanghai
EOF

cat > docker-compose.yml <<'EOF'
name: ${PROJECT_NAME:-ai-pai}

services:
  postgres:
    image: ${POSTGRES_IMAGE:-postgres:16}
    container_name: ai-pai-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME:-ai_pai}
      POSTGRES_USER: ${DB_USER:-ai_pai}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      TZ: ${TZ:-Asia/Shanghai}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-ai_pai} -d ${DB_NAME:-ai_pai}"]
      interval: 5s
      timeout: 5s
      retries: 20

  ai-pai:
    image: ${IMAGE:-ghcr.io/flyljx/ai-pai:latest}
    container_name: ai-pai
    restart: unless-stopped
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      DB_DRIVER: postgres
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${DB_USER:-ai_pai}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME:-ai_pai}
      DB_SSLMODE: disable
      SERVE_STATIC: "true"
      PUBLIC_DIR: public
      LOG_DIR: logs
      PORT: 3001
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${APP_PUBLIC_PORT:-6986}:3001"
    volumes:
      - ./logs:/app/logs

volumes:
  postgres_data:
EOF

log "Pulling images..."
docker compose pull

log "Starting services..."
docker compose up -d

log "Deployment complete."
log "URL: http://127.0.0.1:${APP_PUBLIC_PORT}"
log "Old containers are not removed by this script. After your 7-day migration window, remove them manually if needed."
log "App logs: docker compose logs -f ai-pai"
log "Deployment directory: ${APP_DIR}"
