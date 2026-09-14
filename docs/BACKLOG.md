# HomeBase — Feature backlog

The long-term product roadmap. It lives in two places that must stay in sync:

- **This file** — versioned with the code, the source of truth for anyone reading the repo.
- **The tracker** — https://claude.ai/code/artifact/c45ffccc-75f6-4657-864a-6d5035a0bc46 — the same
  list with live statuses, priorities and notes, editable by the household. "Copy as Markdown"
  on the tracker produces this file's tables.

## Rules

1. Nothing is silently removed. A request that no longer makes sense is **parked** with a note.
2. When a request is implemented, its status becomes **done** (with a note naming the phase or
   commit); the row stays.
3. When a feature introduces obvious follow-up work, add it to the backlog under the right area.
4. Statuses: idea · planned · in progress · done · parked. Priorities: now · next · later.
   Kinds: feature (default) · research · constraint · principle.

## Design & UX

Adopt the Claude Design system as the single visual source of truth across the Angular app.

| Status      | Priority | Request                                                                                                                                                                                                                    |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In progress | now      | **Adopt the chosen design system (Untitled UI) across the Angular application** — Material theme + tokens landed; page-by-page migration under way                                                                         |
| In progress | now      | **Keep the design system as the visual source of truth** _(principle)_ — rules in docs/DESIGN.md; no one-off page styling                                                                                                  |
| Planned     | now      | **Make all screens responsive and consistent**                                                                                                                                                                             |
| In progress | now      | **Establish reusable components and tokens rather than page-specific styling** — tokens (`_tokens.scss`), utilities (`_utilities.scss`), `app-page-header`, `app-empty-state` in place; pages migrating                    |
| Planned     | now      | **UI template: Untitled UI – Free Figma UI kit & design system v2.0** _(research)_ — https://www.figma.com/design/c2BAK2bcFtnjCwigKgJnxE/ ; 2k+ components, 350+ styles, 4px grid, Inter; dark-mode variables are PRO-only |

## Dashboard

One screen that answers "how is the household doing this month?"

| Status      | Priority | Request                                                                                                                |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Idea        | next     | **Monthly spending overview**                                                                                          |
| Idea        | next     | **Spending by category**                                                                                               |
| Idea        | later    | **Monthly income** — depends on bank integration or manual entry                                                       |
| Idea        | later    | **Current account balance** — depends on bank integration                                                              |
| Done        | next     | **Upcoming bills** — shipped in v1.0.0 (Phase 8)                                                                       |
| Idea        | later    | **Recent transactions**                                                                                                |
| In progress | next     | **Household financial snapshot** — v1.0.0 shows expenses, bills, outstanding and your position; income/balance pending |
| Idea        | later    | **Income vs. spending trends and monthly comparisons**                                                                 |

## Bills & email integration

Let invoices flow in from email instead of being typed by hand.

| Status | Priority | Request                                                                                                             |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Idea   | next     | **Connect an email account** — OAuth (Gmail/Outlook) or IMAP with app password; read-only, minimal scopes           |
| Idea   | next     | **Detect recurring bills from known service providers**                                                             |
| Idea   | next     | **Automatically identify incoming invoices**                                                                        |
| Idea   | next     | **Extract amount, due date, provider, invoice number and billing period**                                           |
| Idea   | next     | **Create or update household bills automatically** — map onto an existing Bill occurrence or propose a new one      |
| Idea   | later    | **Store invoice attachments where appropriate** — needs object storage; `Expense.receiptUrl` is reserved            |
| Idea   | next     | **Allow manual correction and confirmation of imported bills** — imports land as drafts until confirmed             |
| Idea   | later    | **Support multiple bill providers with configurable rules** — per-provider matching rules editable by the household |

## Bank & financial integration

Balance, income and transactions, with privacy as a hard constraint.

| Status  | Priority | Request                                                                                                                                                  |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea    | next     | **Track bank account balance**                                                                                                                           |
| Idea    | next     | **Import incoming salary transactions**                                                                                                                  |
| Idea    | next     | **Import relevant account transactions**                                                                                                                 |
| Idea    | later    | **Automatically identify salary and income**                                                                                                             |
| Idea    | later    | **Categorize transactions**                                                                                                                              |
| Idea    | later    | **Associate transactions with household expenses and bills where possible**                                                                              |
| Idea    | later    | **Monthly income and spending calculations**                                                                                                             |
| Idea    | next     | **Investigate Open Banking (PSD2) integration** _(research)_ — aggregator coverage, cost, consent flow, data retention                                   |
| Idea    | later    | **Investigate Android bank SMS/notification integration as an alternative** _(research)_ — on-device companion forwarding structured amounts only        |
| Planned | now      | **Never store bank credentials or unnecessary raw financial messages** _(constraint)_ — tokens via a provider, no passwords, keep only structured fields |

## Household contacts

The plumber you trust, one tap away.

| Status | Priority | Request                                                                                                                                    |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Idea   | next     | **Contact directory for trusted service providers**                                                                                        |
| Idea   | next     | **Provider categories** — plumber, electrician, handyman, HVAC/heating technician, locksmith, internet/telecom provider, custom categories |
| Idea   | next     | **Store name, company, phone, email, website and notes** — tap-to-call and tap-to-email on mobile                                          |
| Idea   | next     | **Mark preferred or trusted providers**                                                                                                    |
| Idea   | later    | **Associate providers with bills, maintenance jobs and expenses**                                                                          |

## Future automation

Things the app should notice and do on its own once the data is there.

| Status      | Priority | Request                                                                                                               |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| Idea        | later    | **Automatic bill detection** — builds on the email integration                                                        |
| Idea        | later    | **Automatic transaction categorization** — builds on the bank integration                                             |
| Idea        | later    | **Automatic recurring-expense detection** — same merchant/amount every month → suggest a Bill                         |
| In progress | next     | **Reminders for upcoming bills** — in-app reminders shipped in v1.0.0 (Phase 9); email/push delivery is the open part |
| Idea        | later    | **Detect unusual spending**                                                                                           |
| Idea        | later    | **Monthly household financial summary** — spent, earned, owed, biggest categories, bills paid                         |

## Platform & follow-ups

Engineering work surfaced while building v1.0.

| Status | Priority | Request                                                                                                                                         |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea   | next     | **Browser end-to-end tests for the critical flows** — Playwright: register, household, invite/accept, shopping, expense split, bill paid        |
| Idea   | next     | **Email delivery for invitations and reminders** — adapter on top of `NotificationsService`; invitations currently need the link shared by hand |
| Idea   | later    | **Real-time updates for shopping lists (WebSockets)** — replace the 60 s notification polling at the same time                                  |
| Idea   | later    | **Household ownership transfer** — owners cannot leave today                                                                                    |
| Idea   | later    | **Receipt uploads for expenses** — object storage + `Expense.receiptUrl`; shares infrastructure with invoice attachments                        |
| Idea   | later    | **PWA install and offline shell** — manifest, service worker for the shell, home-screen install                                                 |

## How we work

| Status      | Priority | Request                                                                                                                                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In progress | now      | **Maintain this backlog as the project's long-term product roadmap** _(principle)_ — never silently remove; mark status when implementing; add follow-ups; keep this file and the tracker in sync |
