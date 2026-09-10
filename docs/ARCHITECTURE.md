# Architecture

HomeBase is a **modular monolith**: one Angular SPA, one NestJS API, one PostgreSQL database.

```text
┌──────────────┐   HTTP /api/*    ┌──────────────┐   Prisma    ┌──────────────┐
│  Angular 19  │ ───────────────▶ │  NestJS 11   │ ──────────▶ │ PostgreSQL 16│
│  (apps/web)  │ ◀─────────────── │  (apps/api)  │ ◀────────── │              │
└──────────────┘      JSON        └──────────────┘             └──────────────┘
```

- In development, `ng serve` proxies `/api` to the API (no CORS needed).
- In the Docker `app` profile, nginx serves the SPA and proxies `/api` to the API container.
- In production the same shape applies: a reverse proxy in front of both.

## Core domain concept

The **Household** is the aggregate root. A user can belong to many households; almost every
other entity belongs to exactly one household and carries a `householdId` (directly or via a
short relationship chain) so authorization can be enforced efficiently.

```text
User ──< HouseholdMember >── Household ──< Expense / Bill / Chore / Task / ShoppingList / Note / Activity
                                └──< HouseholdInvitation
```

**Rule:** a request may only touch data belonging to a household the authenticated user is a
member of. Client-supplied `householdId`, `userId` and `memberId` values are never trusted;
services verify membership before every read or write.

## Backend (apps/api)

Organized by domain module. Each module keeps a clean split:

```text
controller  → validates (DTO), authenticates/authorizes, calls service, returns response
service     → business rules, transactions, activity/notification side-effects
prisma      → data access (PrismaService; repositories added where queries get complex)
dto/        → request/response shapes with class-validator decorators
```

Current modules:

| Module   | Purpose                                                        |
| -------- | -------------------------------------------------------------- |
| `config` | Validated, typed environment access (`AppConfigService`)       |
| `prisma` | Global `PrismaService` (connection lifecycle, health `ping()`) |
| `health` | `GET /api/health` — 200 when DB reachable, 503 otherwise       |

Planned modules follow the spec: `auth`, `users`, `households`, `invitations`, `expenses`,
`bills`, `chores`, `tasks`, `shopping`, `notes`, `notifications`, `activity`, `common`.

### Cross-cutting defaults (set in `main.ts`)

- Global prefix `/api`
- `helmet()` security headers, `x-powered-by` disabled
- CORS restricted to `CORS_ORIGIN` (comma-separated allow-list)
- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` (mass-assignment protection)
- Shutdown hooks so Prisma disconnects cleanly

### Configuration

`@nestjs/config` loads `.env` (app-local first, then repository root) and validates it with
`class-validator` at boot. Missing or malformed values fail fast with a readable message.
Nothing reads `process.env` directly outside `config/`.

### Database

- PostgreSQL 16, accessed through Prisma 6.
- UUID primary keys, `created_at` / `updated_at` timestamps (timestamptz), snake_case columns.
- Foreign keys with `ON DELETE CASCADE` where the child cannot exist without the parent.
- Multi-record writes (expense + splits, invitation acceptance, chore completion, …) run inside
  `prisma.$transaction`.
- Migrations live in `apps/api/prisma/migrations` and are applied with `prisma migrate deploy`.

## Frontend (apps/web)

Feature-based structure with standalone components, signals and lazy-loaded routes:

```text
src/app/
  core/         singletons: auth, guards, interceptors, API services, models
  shared/       reusable presentational components, pipes, directives
  features/     one folder per feature (dashboard, household, expenses, …), lazy-loaded
```

- Angular Material for UI, `OnPush` change detection by default (configured in `angular.json`).
- HTTP via `provideHttpClient(withFetch())`; API base URL from `src/environments`.
- Components read state through signals; services expose `Observable`s or signals as fits.

## Health check contract

```json
GET /api/health → 200 | 503
{
  "status": "ok" | "degraded",
  "timestamp": "2026-09-10T12:00:00.000Z",
  "uptimeSeconds": 123,
  "version": "0.1.0",
  "environment": "development",
  "checks": { "database": { "status": "up" | "down", "latencyMs": 3, "error": "…" } }
}
```

The API deliberately **does not crash** when the database is unreachable at boot; it logs the
error and reports `degraded` so the failure is visible in the UI and to orchestrators.

## Future-proofing (not implemented)

- Real-time sync: services already own all writes, so a WebSocket gateway can broadcast from
  the service layer later without touching controllers.
- Notifications: a `Notification` model + `NotificationsService` will be the single choke point;
  channels (in-app, email, push) become adapters.
- Deployment: both apps have Dockerfiles; the compose `app` profile mirrors a single-host deploy.
