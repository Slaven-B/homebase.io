# Development Guide

## Setup

```bash
npm install            # installs both apps (npm workspaces)
cp .env.example .env   # local configuration (git-ignored)
npm run db:up          # PostgreSQL in Docker
npm run prisma:generate
npm run prisma:deploy  # apply migrations
npm run dev            # API on :3000, web on :4200
```

Node 20.11+ is required (Angular 19 / NestJS 11). `.nvmrc` pins the major version.

## Daily workflow

| Task                  | Command                                                             |
| --------------------- | ------------------------------------------------------------------- |
| Run everything        | `npm run dev`                                                       |
| API only / web only   | `npm run dev:api` / `npm run dev:web`                               |
| Lint                  | `npm run lint`                                                      |
| Format                | `npm run format` (Prettier, whole repo)                             |
| API unit tests        | `npm run test:api` (Jest)                                           |
| API integration tests | `npm run test:api:e2e` (Jest + supertest)                           |
| Web unit tests        | `npm run test:web` (Karma, headless Chrome)                         |
| Everything CI runs    | `npm run lint && npm test && npm run test:api:e2e && npm run build` |

Karma needs a Chrome/Chromium binary. If it is not on the default path, set `CHROME_BIN`.

## Database & Prisma

- Schema: `apps/api/prisma/schema.prisma`
- The `prisma:*` npm scripts load the repository-root `.env` through `dotenv-cli`, so one `.env`
  serves Docker Compose, the API runtime and the Prisma CLI. Real environment variables win over
  the file (CI relies on this).
- Create a migration after changing the schema:
  ```bash
  npm run prisma:migrate -- --name add_expenses
  ```
  This applies it to your local DB and regenerates the client.
- Apply existing migrations (CI/prod): `npm run prisma:deploy`
- Inspect data: `npm run prisma:studio`
- Start over: `npm run db:reset` then `npm run prisma:deploy`

Conventions: UUID ids, snake_case column names via `@map`, `timestamptz` timestamps,
explicit `onDelete` behaviour on every relation, indexes on every foreign key used in lookups.

## Adding a backend module

1. `apps/api/src/<domain>/` with `<domain>.module.ts`, `.controller.ts`, `.service.ts`, `dto/`.
2. DTOs use `class-validator`; never accept `householdId`/`userId` from the body when it can be
   derived from the route or the authenticated user.
3. Every household-scoped service method first verifies membership.
4. Multi-record writes go in `prisma.$transaction`.
5. Unit-test the service with a mocked `PrismaService`; add an e2e test for the endpoint,
   including an **authorization test** (user A cannot reach household B).
6. Register the module in `AppModule`.

## Adding a frontend feature

1. `apps/web/src/app/features/<feature>/` with a `<feature>.routes.ts` and standalone components.
2. Lazy-load it from `app.routes.ts`:
   ```ts
   { path: 'expenses', loadChildren: () => import('./features/expenses/expenses.routes').then(m => m.EXPENSES_ROUTES) }
   ```
3. API access lives in a `core/services` or feature-level service; components stay thin.
4. Provide loading, empty and error states; destructive actions require confirmation.
5. Add component/service specs alongside the code.

## Code style

- Prettier (root `.prettierrc`): single quotes, trailing commas, 100 columns.
- ESLint: `typescript-eslint` type-checked rules for the API, `angular-eslint` for the web.
- Commit small, runnable increments. Each phase ends with: run app → run tests → verify
  migrations → verify authorization → commit.

## Environment variables

See `.env.example`. The API validates them at startup (`apps/api/src/config/env.validation.ts`);
add new variables there first so misconfiguration fails fast.

## Troubleshooting

- **`/api/health` returns 503** — the API is running but PostgreSQL is not reachable. Check
  `npm run db:up` and `DATABASE_URL`.
- **Web shows "Cannot reach the API"** — the API is not running on :3000 (dev proxy target).
- **Type errors mentioning two copies of `rxjs`** — run `npm dedupe`; both apps must resolve the
  same `rxjs` version (pinned to `^7.8.2`).
- **Prisma client out of date** — `npm run prisma:generate`.
- **`Environment variable not found: DATABASE_URL` from Prisma** — no root `.env`; run
  `cp .env.example .env`.
