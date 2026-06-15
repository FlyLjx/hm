# Go + NewAPI-Style UI Migration Plan

The target is not a visual-only rewrite. The system should keep existing AI-PAI
features while moving the backend runtime to Go and reshaping the admin UI toward
a cleaner NewAPI-style operations console.

## Why Go Helps Here

- Image generation tasks are long-running and concurrent.
- Provider health checks, task timeout checks, SSE, and WebSocket fan-out fit Go
  goroutines well.
- A Go binary is easier to deploy than a split runtime with many moving files.
- Database and provider calls can be bounded with contexts and timeouts more
  consistently.

Go does not remove the need for queues, task state, rate limits, or provider
timeouts. Those parts still need explicit design.

## Preserve Existing Product Behavior

These contracts should stay stable during migration:

- Public frontend routes and static files.
- Admin login token behavior until the UI is replaced.
- User credits and credit logs.
- Generation task lifecycle: queued, processing, success, failed, canceled.
- `/api/generate/image` and `/api/generate/image/stream`.
- `/api/tasks/*` history, image display, thumbnail, favorite, public display.
- `/v1/models`, `/v1/images/generations`, `/v1/images/edits`,
  `/v1/chat/completions`, `/v1/responses`, `/v1/balance`.
- OAuth routes for external canvas or partner apps.

## Backend Module Order

1. Foundation
   Config, logging, MySQL, migrations, static files, health checks.
   Status: started in `go-server`.

2. Auth and Users
   User login/register, admin login, sessions/tokens, password verification,
   profile, balance, user WebSocket.
   Status: admin login/session and user login/profile are implemented first.
   Registration, password reset, user list, recharge, API keys, and user
   WebSocket still remain in the old stack until parity is finished.

3. Models and Providers
   Merge the current provider/model management into one Go service boundary.
   Keep `sub2api`, `custom`, and `newapi` provider behavior explicit. Do not use
   hidden fallback channels.
   Status: list/create/update/delete and model sort order are implemented in Go.
   Remote model sync and provider test still remain to migrate.

4. Tasks
   Task repository, status updates, cancel, timeout scheduler, public display,
   favorites, image URL fallback states.
   Status: task create, detail, user history, admin task list, cancel, gallery,
   public review, URL redirect/download/check, and WebSocket fan-out are
   implemented in Go. Timeout scheduler and richer queue metrics remain.

5. Generation
   Provider adapter interface:
   - images generation
   - image edits
   - chat completions image mode
   - responses image mode

   Error policy:
   - If upstream returns a policy or request error, return failure directly.
   - Do not retry on content policy errors.
   - Do not fallback to chat completions unless the selected provider type says
     that endpoint is the only supported path.
   Status: Go worker queue and concurrent `/v1/images/generations` JSON adapter
   are started. Successful URL result storage and atomic credit deduction are
   implemented. URL-based image edits are routed through `/images/edits`.
   Chat/Responses text proxying is implemented for OpenAI-compatible API calls.
   API logs, prompt moderation, subscriptions, and notification hooks remain.

6. OpenAI-Compatible API
   Reuse the same generation/task service so API users and web users produce the
   same task records and credit behavior.

7. Admin Operations
   Dashboard, finance, credit center, model center, logs, system logs, image
   manager, users, redeem codes, shop, subscriptions.

## NewAPI-Style Admin UI Direction

The UI can borrow NewAPI's operational-console feeling:

- Left navigation with fewer top-level groups.
- Dense data tables with compact filters.
- Model and provider in one "Model Center".
- Credits, flow, and stats in one "Credit Center".
- Logs split by category tags instead of separate heavy pages.
- Inline status badges, compact actions, and side panels for detail/edit.

Do not copy NewAPI data assumptions directly. AI-PAI has image generation tasks,
credits, public plaza, OAuth, prompt library, and user-facing pages that are
different from a generic API gateway.

## Deployment Shape

During migration:

```text
apps/admin/*             new admin frontend source
apps/web/*               new public frontend source
public/*                 current static frontend, kept until replacement is done
server/*                 legacy backend source, being retired
go-server/*              current Go backend
release/*                package output
```

After migration:

```text
aipi-go.exe              serves API + static frontend
public/*                 static UI
logs/*                   runtime logs
.env                     same deployment config
```

## Target Source Layout

Frontend and backend must stay separated. Admin and public web also stay
separated because their component density, navigation, and workflows are
different.

```text
apps/
  admin/
    src/
      app/               admin shell, routes, guards
      api/               admin API clients
      components/        admin-only table, filter bar, form drawer
      features/          dashboard, model center, users, finance, logs
      styles/            NewAPI-style admin theme
  web/
    src/
      app/               public shell and routes
      api/               public API clients
      components/        prompt input, image grid, task placeholder
      features/          chat image, text chat, history, plaza, profile
      styles/            public creative UI theme

go-server/
  internal/
    auth/
    config/
    database/
    httpserver/          route registration and thin HTTP handlers
    users/
    providers/
    models/
    tasks/
    generation/          queue, billing, adapters, image extraction
```

Rules:

- No page should own raw fetch logic; use an API module.
- No backend handler should contain SQL directly; use repositories/services.
- No generation adapter should mutate credits; billing stays in billing service.
- Admin table/filter/dropdown components should be reusable across admin pages.
- Public web components should not import admin components.

## Acceptance Checks Per Migrated Module

- Same request/response contract as the legacy backend.
- Same database writes.
- Same credit deduction/refund behavior.
- Same frontend visible result.
- Explicit error messages in task placeholder.
- No duplicate upstream submission after upstream error.
- Build passes with `go build ./...`.

## Implemented Go Compatibility Routes

- `GET /api/health`
- `GET /api/service-status`
- `GET /api/go/migration`
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/users/login`
- `GET /api/users/:id/profile`
- `GET /api/users`
- `GET /api/api-providers`
- `POST /api/api-providers`
- `PATCH /api/api-providers/:id`
- `DELETE /api/api-providers/:id`
- `GET /api/models`
- `POST /api/models`
- `PATCH /api/models/:id`
- `DELETE /api/models/:id`
- `PATCH /api/models/sort-orders`
- `POST /api/generate/image`
- `POST /api/generate/image/stream`
- `GET /api/tasks/:id`
- `GET /api/tasks/history`
- `GET /api/tasks/favorites`
- `GET /api/tasks/public-display`
- `GET /api/tasks/images`
- `GET /api/tasks/image-check`
- `GET /api/tasks/stats`
- `GET /api/tasks/estimate`
- `POST /api/tasks/:id/cancel`
- `PATCH /api/tasks/:id/favorite`
- `POST /api/tasks/:id/public-request`
- `PATCH /api/tasks/:id/display`
- `PATCH /api/tasks/:id/public-review`
- `GET /api/tasks/:id/images/:index`
- `GET /api/tasks/:id/images/:index/download`
- `GET /api/system-logs`
- `GET /api/system-logs/detail`
- `GET /api/system-logs/stream`
- `DELETE /api/system-logs/:name`
- `GET /v1/models`
- `GET /v1/balance`
- `GET /v1/credits`
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /ws/tasks`
- `GET /ws/users`

The migrated auth routes intentionally use the existing token format and
password hash formats so the frontend can switch without forcing users to log in
again.

Current image policy in Go is URL-only. Base64 image payloads are not exposed to
the frontend, and generated image access uses task image URLs that redirect to
the upstream URL. If the upstream URL expires or becomes unavailable, image check
and proxy endpoints return the user-facing message "图片跑丢了".
