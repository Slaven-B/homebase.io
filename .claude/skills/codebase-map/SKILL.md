---
name: codebase-map
description: Query the graphify knowledge graph for structural facts about this codebase - what depends on a symbol, the blast radius of changing it, architectural hubs, how two things connect. Use before changing any shared service, guard, DTO or type in apps/api, and whenever the question is "what else does this touch". Not for conceptual questions about why code works the way it does.
---

# Structural queries over the codebase

`graphify` holds a local AST-derived graph of the repo. It answers *what connects to what*.
It does not answer *why*, and it is wrong in specific ways documented below.

## Running it

The binary is at `C:\Users\Slaven\.local\bin\graphify.exe`. That directory is on the user PATH
but a shell does not always inherit it — prepend it or call the full path rather than assuming
`graphify` resolves.

```bash
graphify update .                      # incremental refresh; do this first if the repo moved
graphify affected "SymbolName" --depth 2
graphify god-nodes --top 12
graphify path "A" "B" --undirected
```

The graph lives in `graphify-out/` (git-ignored). Rebuild from scratch with
`graphify extract . --code-only`. Nothing refreshes it automatically — by deliberate choice,
there is no PreToolUse hook and no git hook.

## The one that earns its place

**`affected`, before editing shared API code.** Grep finds direct string matches; it does not
find transitive reach. `HouseholdAccessService` looks like one file until `affected` shows it
consumed by all ten feature modules across ~80 call sites. Changing a signature there without
that list means a scattered break, or worse, a permission check quietly skipped.

`god-nodes` is the architectural spine. `path` traces how two symbols connect.

## Where it lies — read this before trusting a result

- **No HTML, no SCSS.** Zero nodes from either; the tree-sitter grammars are not bundled and no
  optional extra adds them. Component-to-component wiring declared in templates, and the whole
  Untitled UI token layer, are invisible. Use the browser (`testing-the-app`) for anything visual.
- **The tiers are not connected.** SQL migrations, API TypeScript and web TypeScript are three
  separate islands. There is no path from the `expenses` table to `ExpensesService`, because the
  real links are runtime strings (`prisma.expense.findMany()`, `http.get('/api/expenses')`) that
  no AST parser sees. Any cross-tier path it returns is routed through shared `package.json`
  dependencies and is meaningless — `ExpensesController → @nestjs/common → package.json → eslint
  → package.json → @angular/common → ExpensesPageComponent` is a real result it will give you.
- **Ambiguous names.** Several symbols exist twice, once per app (`ExpensesService`). It will
  list both; disambiguate with the full node id.
- **Skip plain-language `query`.** It seeds on loosely-matching symbols and returns bare node
  names with no synthesis. Grep plus reading the file beats it for conceptual questions.

## Reinstalling

`uv tool install --python 3.12 "graphifyy[sql]"`. Both parts matter: the 3.12 pin avoids a
compile against missing MSVC build tools, and without `[sql]` the 8 migration files silently
contribute nothing.
