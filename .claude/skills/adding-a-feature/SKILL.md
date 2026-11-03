---
name: adding-a-feature
description: The checklist for adding a backend module or a frontend feature to HomeBase - structure, authorization, transactions, lazy-loaded routes, required states, and what each one must be tested with. Use when adding or extending any API module, endpoint, page or feature, or when changing the Prisma schema.
---

# Adding to HomeBase

The full procedures are in `docs/DEVELOPMENT.md` ("Adding a backend module", "Adding a frontend
feature", "Database & Prisma") and `docs/DESIGN.md` ("Adding a page"). Read the relevant section
rather than working from memory. This skill exists to make sure the steps that get skipped
are not skipped.

## The ones that get skipped

**Authorization is not optional and not implied.** Every household-scoped service method verifies
membership through `HouseholdAccessService` before touching data, and every new endpoint gets an
e2e test proving user A cannot reach household B. A unit test with a mocked `PrismaService`
proves nothing about this.

**Run `affected` before touching shared code.** If the change reaches a service, guard, DTO or
type that other modules import, get the blast radius first — see the `codebase-map` skill.

**Loading, empty and error states.** Required for every frontend feature. Destructive actions
require confirmation.

**Migrations are a separate deliberate step.** `npm run prisma:migrate -- --name <name>` after a
schema change, applied locally and with the client regenerated. Conventions: UUID ids,
snake_case columns via `@map`, `timestamptz`, explicit `onDelete` on every relation, an index
on every foreign key used in lookups.

**Multi-record writes go in `prisma.$transaction`.**

**Register the module in `AppModule`**, and lazy-load frontend features from `app.routes.ts` —
a feature that works but is not wired in looks identical to one that was never built.

## Design

New UI follows `docs/DESIGN.md`: semantic tokens only, shared classes for page chrome, Material
components themed centrally, 4px grid, stacking to one column under ~720px. A page's own SCSS
holds only what is genuinely unique to that page.

## Finishing

Per `docs/DEVELOPMENT.md`: run app → run tests → verify migrations → verify authorization →
commit. "Run app" means the `testing-the-app` skill — drive the feature in a browser, don't
infer it works from green unit tests.

Then update `docs/BACKLOG.md`: mark the implemented row **done** with a note naming the phase or
commit, and add any follow-up work the feature surfaced. Keep the tracker artifact in sync.
