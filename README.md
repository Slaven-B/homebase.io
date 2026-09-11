# HomeBase — Shared Household Manager

A web application for people who live together (couples, families, roommates) to manage
members, shared expenses, bills, chores, shopping lists, tasks, notes and household activity.

**Stack:** Angular 19 · NestJS 11 · PostgreSQL 16 · Prisma 6 · Docker Compose

> Status: **Phase 7 — Expenses done.** Accounts, households, invitations, activity, dashboard,
> shopping lists, tasks, chores, shared expenses with balances and settlements. Bills are next.
> See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan.

## Repository layout

```text
homebase.io/
├── apps/
│   ├── api/          NestJS API (Prisma, PostgreSQL)
│   └── web/          Angular web app (Angular Material)
├── docs/             Architecture, development guide, roadmap
├── docker-compose.yml
├── .env.example
└── package.json      npm workspaces + root scripts
```

## Prerequisites

- Node.js 20.11+ (see `.nvmrc`) and npm 10+
- Docker Desktop (for PostgreSQL)

## Quick start

```bash
# 1. Install everything (single install for both apps)
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start PostgreSQL
npm run db:up

# 4. Generate the Prisma client and apply migrations
npm run prisma:generate
npm run prisma:deploy

# 5. Run API + web together
npm run dev
```

Then open:

| What          | URL                              |
| ------------- | -------------------------------- |
| Web app       | http://localhost:4200            |
| API health    | http://localhost:3000/api/health |
| Prisma Studio | `npm run prisma:studio`          |

In development the Angular dev server proxies `/api/*` to the NestJS server, so the browser
talks to a single origin and no CORS configuration is needed locally.

## Common scripts (run from the repository root)

| Script                   | What it does                                      |
| ------------------------ | ------------------------------------------------- |
| `npm run dev`            | API (watch) + web (dev server) concurrently       |
| `npm run dev:api`        | API only                                          |
| `npm run dev:web`        | Web only                                          |
| `npm run build`          | Production build of both apps                     |
| `npm run lint`           | ESLint for both apps                              |
| `npm run format`         | Prettier (write) across the repo                  |
| `npm test`               | API unit tests + web unit tests (headless Chrome) |
| `npm run test:api:e2e`   | API integration tests (supertest)                 |
| `npm run db:up`          | Start PostgreSQL container                        |
| `npm run db:reset`       | Drop the database volume and start fresh          |
| `npm run prisma:migrate` | Create/apply a migration in development           |
| `npm run prisma:deploy`  | Apply pending migrations (CI / production)        |

## Full stack in Docker

```bash
docker compose --profile app up --build
```

Runs PostgreSQL, the API (with migrations applied on start) and the web app behind nginx
on http://localhost:4200.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — day-to-day workflow, conventions, testing
- [docs/ROADMAP.md](docs/ROADMAP.md) — development phases and definition of done
