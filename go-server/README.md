# AI-PAI Go Backend

This directory is the Go backend for AI-PAI. It serves the public web app,
admin console, OpenAI-compatible API, WebSocket updates, task queue, billing,
logs, and core operations from one compiled binary.

## Current Scope

- Runtime config from the existing `.env` keys.
- MySQL connection using the existing `aipi` database.
- `/api/health` compatible health response.
- `/api/service-status` ready response.
- `/api/go/migration` migration status.
- Static `public/web` and `public/admin` fallback routes.
- Compatible admin login/session.
- Compatible user login/profile.
- Model/provider CRUD and sorting.
- Generation task creation, queue workers, URL-only image generation adapter,
  and atomic success billing.
- Task history, image list, public display, favorites, public review, cancel,
  image URL redirect/download/check, and WebSocket task updates.
- User WebSocket balance snapshots for frontend credit refresh.
- System log list/detail/delete/SSE stream.
- OpenAI-compatible routes: `/v1/models`, `/v1/balance`,
  `/v1/credits`, `/v1/images/generations`, `/v1/images/edits`,
  `/v1/chat/completions`, and `/v1/responses`.
- Registration, password reset, email verification, OAuth, announcements,
  promotions, recharge products, subscriptions, redeem codes, check-ins,
  invites, mail broadcast, payment callback compatibility, prompt reverse,
  prompt library proxy, API keys, API logs, account pool, and admin statistics.

## Structure Rules

- `httpserver`: route registration, request parsing, response writing only.
- `users`, `models`, `providers`, `tasks`: repository and domain types.
- `generation`: queue, adapters, billing, prompt building, image extraction.
- SQL should not be written inside frontend or route files.
- Billing should not be hidden inside upstream adapter code.
- Provider fallback must be explicit. Do not silently retry another endpoint after
  upstream rejects a request.

## Run Locally

```powershell
cd go-server
$env:GOPROXY="https://goproxy.cn,direct"
go mod tidy
go run ./cmd/aipi-go
```

If Go is not on PATH in the current terminal after installation, use:

```powershell
& "C:\Program Files\Go\bin\go.exe" run ./cmd/aipi-go
```

## Repo Build

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-ui.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-go.ps1
powershell -ExecutionPolicy Bypass -File scripts/check-release.ps1
```

## Migration Principle

Do not change frontend API contracts casually. Go modules should keep the
existing response shape, status codes, auth behavior, and database side effects
so old deployment data and clients continue to work.
