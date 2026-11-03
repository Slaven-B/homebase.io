---
name: testing-the-app
description: Verify a change by actually driving HomeBase in a real browser via the Playwright MCP server - registering a user, creating a household, and walking the critical flows. Use whenever a change touches the web app or an API endpoint the UI calls, when asked to test, verify, check or "see if it works", and before calling any user-facing work done. Unit tests alone do not satisfy this.
---

# Testing HomeBase by using it

Unit tests prove functions behave. They do not prove the app works. A change to anything
user-facing is verified by driving the real app and seeing the result.

## Before driving anything

The app must actually be running, with a database behind it:

```bash
npm run db:up          # PostgreSQL in Docker; Docker Desktop is NOT on the Bash PATH
npm run dev            # API on :3000, web on :4200
```

Wait for both to be listening before the first navigation. If `/api/health` returns 503 the API
is up but Postgres is not — see Troubleshooting in `docs/DEVELOPMENT.md`.

## Getting to a usable state

There is no seeded account. The browser profile is `--isolated`, so every run starts logged out
with an empty database view. Register a throwaway user through the UI, then create a household.
Everything else in the app is household-scoped and unreachable until that exists.

Use realistic values. A household called `test` with an expense of `1` passes while hiding
formatting, rounding and truncation bugs that real values expose.

## The critical flows

These are the flows the backlog commits to covering. Walk the ones your change can affect, not
all six every time:

1. **Register** → land on the dashboard
2. **Create a household** → appears with the creator as owner
3. **Invite and accept** → second user joins and sees shared data
4. **Shopping list** → add items, tick them off, clear completed
5. **Expense split** → create a split expense, check the balances are right on both sides
6. **Bill paid** → mark a bill paid, confirm the state and the activity feed entry

A flow is not verified because the page rendered. It is verified when the data that came back
is correct — the balance actually nets out, the activity entry actually names the right user.

## What to check beyond "it rendered"

- **Console errors.** The server runs with the `devtools` capability; read the console after each
  flow. An Angular error that does not break the page still breaks the build later.
- **Both widths.** Resize to ~400px and re-check anything layout-related. `docs/DESIGN.md`
  requires stacking to one column under ~720px and nothing wider than the viewport.
- **Empty, loading and error states**, which `docs/DEVELOPMENT.md` requires for every feature
  and which are the states unit tests most often skip.
- **Authorization, by actually trying it.** Where a change touches household-scoped data, confirm
  a second user in a different household genuinely cannot reach it. This is the rule most worth
  testing for real, because a passing unit test with a mocked Prisma proves nothing about it.

## Reporting

Say what you did and what happened. If a flow failed, say which step, what you expected and what
you saw — never "tests pass" when a flow was not walked. If a flow could not be reached (service
down, blocked by an unrelated bug), say that it was skipped and why, rather than leaving it
implied.

Screenshots land in `.playwright-mcp/` (git-ignored). Attach one when something looks wrong;
a description of a visual bug is worse than the picture.

## Related

- `docs/DEVELOPMENT.md` — commands, troubleshooting, the per-feature requirements
- `docs/DESIGN.md` — responsive rules the 400px pass is checking against
- `docs/BACKLOG.md` → "Platform & follow-ups" — the end-to-end test row this work advances
