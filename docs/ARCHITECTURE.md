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

| Module        | Purpose                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------- |
| `config`      | Validated, typed environment access (`AppConfigService`)                                     |
| `prisma`      | Global `PrismaService` (connection lifecycle, health `ping()`)                               |
| `health`      | `GET /api/health` — 200 when DB reachable, 503 otherwise                                     |
| `auth`        | Register, login, refresh, logout; global `JwtAuthGuard`                                      |
| `users`       | `GET`/`PATCH /api/users/me` profile endpoints                                                |
| `common`      | `@Public()`, `@CurrentUser()` decorators, shared request types                               |
| `households`  | Households, members, roles; exports `HouseholdAccessService`                                 |
| `invitations` | Email-bound invitations: create/revoke (admins), list/accept/decline (invitee)               |
| `activity`    | Append-only household activity log (`ActivityService.log`, cursor-paged list); global module |
| `dashboard`   | `GET /api/households/:id/dashboard` — one round trip for the home screen                     |
| `shopping`    | Shopping lists and items under `/households/:id/shopping-lists`; feeds the dashboard         |
| `tasks`       | One-off tasks with status, priority, date-only due date, assignee, comments                  |
| `chores`      | Recurring chores; `recurrence.ts` computes the next due date; completion history             |

Planned modules follow the spec: `expenses`, `bills`, `notes`,
`notifications`.

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

## Household authorization

Every household-scoped operation starts with `HouseholdAccessService`:

| Method          | Meaning                       | Failure              |
| --------------- | ----------------------------- | -------------------- |
| `requireMember` | user belongs to the household | 404 (no enumeration) |
| `requireAdmin`  | role is OWNER or ADMIN        | 403                  |
| `requireOwner`  | role is OWNER                 | 403                  |

Role rules: OWNER manages roles (ADMIN/MEMBER only; ownership is not transferable yet), can
remove anyone but themselves and must delete the household instead of leaving. ADMIN can rename,
invite/revoke and remove regular members. MEMBER can view and leave.

Invitations are bound to an email address: only the account with that email can preview,
accept or decline (403 otherwise). Tokens are single-use and expire after 7 days. Accepting
creates the membership and marks the invitation accepted in one transaction.

## Activity feed

Services (never controllers or clients) call `ActivityService.log()` with a stable `action`
string such as `household.renamed`, an entity reference and a small `metadata` object. The API
stores facts, not sentences; the frontend maps actions to text in `activity-text.ts`, so wording
can change without touching data. Logging accepts a transaction client so the entry commits with
the change it describes, and it never throws — a failed log line must not fail the user's action.
`GET /households/:id/activity?limit&cursor` pages newest-first by `(createdAt, id)`.

## Shopping lists

Lists and items are always addressed through the household (`/households/:id/shopping-lists/:listId`).
The service first checks membership, then loads the list **with the household id in the
where clause**, so a list id from another household is simply "not found". Any member can
create lists and add, edit, complete or remove items; deleting a whole list is limited to admins
and the list creator. Completing an item records who and when; reopening clears both.
`clear-completed` bulk-deletes bought items. Item quantity is free text ("2", "500 g"). Writes go
through one service, which is where a WebSocket broadcast will hook in later.

## Tasks and chores

Tasks are one-off (`TODO` → `IN_PROGRESS` → `DONE`); chores recur. Both live under the household
path, validate that an assignee is a member, and limit deletion to admins and the creator.

Due dates are **calendar dates** (`@db.Date`), handled as UTC-midnight `Date`s on the server and
as `YYYY-MM-DD` strings on the wire, so nothing shifts with time zones.

Chore recurrence (`chores/recurrence.ts`, unit-tested):

- `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY` or `CUSTOM` every N days.
- Completing or skipping writes a `ChoreCompletion` row (who, when, for which scheduled date,
  skipped or not) and advances `nextDueAt` **from the scheduled date**, so a weekly chore keeps
  its weekday even when done late or early. Missed periods are skipped so the next date is always
  after today. Monthly recurrence clamps to month end (Jan 31 → Feb 28).
- Skipping does not update `lastCompletedAt`.

The dashboard shows active chores and open tasks that are due today or overdue.

## Dashboard

`GET /households/:id/dashboard` returns a stable, fully typed shape: household header (with the
pending-invitation count for admins only), `today` (chores, tasks, bills, shopping), `finances`
for the current month and `recentActivity`. Sections owned by later phases are present but empty,
so the frontend and the contract do not change as modules land.

## Authentication

```text
Browser                              API                                   DB
  │  POST /api/auth/login             │                                     │
  │──────────────────────────────────▶│ argon2id verify                     │
  │  { user, accessToken, expiresIn } │ create RefreshToken (sha256 hash) ─▶│
  │◀──────────────────────────────────│ Set-Cookie: hb_refresh (httpOnly,   │
  │                                   │   SameSite=Lax, Path=/api/auth)     │
  │  GET /api/... Authorization:      │                                     │
  │      Bearer <access JWT>          │ JwtAuthGuard verifies HS256         │
  │  POST /api/auth/refresh (cookie)  │ revoke old, issue new (rotation)    │
  │  POST /api/auth/logout  (cookie)  │ revoke whole family, clear cookie   │
```

- **Access token**: HS256 JWT, 15 minutes by default (`JWT_ACCESS_TTL_SECONDS`), held only in
  memory by the SPA. Payload: `sub` (user id), `email`.
- **Refresh token**: 256-bit opaque string; only its SHA-256 hash is stored. Sent as an httpOnly
  cookie scoped to `/api/auth`, so it never accompanies normal API calls. 30 days by default.
- **Rotation + reuse detection**: every refresh revokes the presented token and issues a new one
  in the same `familyId`. Presenting an already-revoked token revokes the entire family.
- **Secure by default**: `JwtAuthGuard` is a global `APP_GUARD`; routes opt out with `@Public()`.
  `@CurrentUser()` gives handlers the verified identity — never trust ids from the body.
- **Passwords**: argon2id (19 MiB, t=2). Login uses a constant-cost dummy hash for unknown emails
  and returns the same message for wrong email or password.
- **Rate limiting**: `@nestjs/throttler` globally (300/min) with tighter `@Throttle()` limits on
  register (5/min), login (10/min) and refresh (30/min). Disabled when `NODE_ENV=test`.
- **Frontend**: `AuthService` (signals) restores the session on startup via `/auth/refresh`;
  `authInterceptor` adds the Bearer header and, on 401, refreshes once and retries;
  `authGuard` / `guestGuard` protect routes and remember the redirect target.
