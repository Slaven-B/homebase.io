# HomeBase

Shared household manager. npm workspaces monorepo: **`apps/api`** (NestJS 11 + Prisma +
PostgreSQL) and **`apps/web`** (Angular 19 + Angular Material, themed with Untitled UI tokens).
Node 20.11+ required; `.nvmrc` pins the major. Shipped v1.0.0.

## Rules that always apply

1. **Every household-scoped service method verifies membership first.** No exception. The check
   lives in `HouseholdAccessService`; call it before touching data. Every new endpoint gets an
   e2e authorization test proving user A cannot reach household B.
2. **Never accept `householdId` or `userId` from a request body** when it can be derived from the
   route or the authenticated user.
3. **Components reference semantic tokens, never literal colors.** `var(--hb-text-tertiary)`, not
   `#475467` and not `var(--hb-gray-600)`. Scale steps are for defining semantics in
   `_tokens.scss` only.
4. **Material first, themed centrally.** Buttons, inputs, selects, dialogs, menus, snack bars and
   toggles are Angular Material, themed in `styles.scss`. Don't restyle them locally. Don't
   substitute a native control for a Material one to avoid a dependency — visual coherence wins.
5. **The backlog never loses a row.** `docs/BACKLOG.md` is the long-term roadmap. Nothing is
   silently removed; implemented requests become **done** with a note; obsolete ones are
   **parked** with a reason; follow-up work is added under the right area. Keep the file and the
   tracker artifact in sync.
6. **Commit small, runnable increments.** Each increment ends with: run app → run tests → verify
   migrations → verify authorization → commit. Commit only when asked.
7. **Multi-record writes go in `prisma.$transaction`.**

## Where things are documented

| Doc                    | Covers                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `docs/ARCHITECTURE.md` | Domain model and every feature's design                          |
| `docs/DEVELOPMENT.md`  | Setup, commands, Prisma, adding modules/features, troubleshooting |
| `docs/DESIGN.md`       | Design system: tokens, utilities, rules, adding a page           |
| `docs/BACKLOG.md`      | Long-term roadmap and how it is maintained                       |
| `docs/DEPLOYMENT.md`   | Deploying and operating                                          |

## Commands

`npm run dev` (API :3000, web :4200) · `npm run lint` · `npm run test:api` ·
`npm run test:web` · `npm run test:api:e2e` · `npm run prisma:migrate -- --name <name>`

Full table and troubleshooting in `docs/DEVELOPMENT.md`.

## Tooling notes

- **Codebase graph.** `graphify` is installed for structural queries — see the
  `codebase-map` skill. Use it for impact analysis before changing shared API code.
- **Browser testing.** The `playwright` MCP server is configured in `.mcp.json` — see the
  `testing-the-app` skill. Verify UI work by driving the real app, not only by unit tests.
