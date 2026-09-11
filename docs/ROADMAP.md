# Roadmap

The application is built incrementally. After every phase the app must run, tests must pass,
migrations must apply cleanly, authorization must be verified, and the work is committed.

| Phase | Scope                                                        | Status  |
| ----- | ------------------------------------------------------------ | ------- |
| 1     | Foundation: monorepo, Docker, Prisma, NestJS, Angular, CI    | ✅ done |
| 2     | Authentication: register, login, refresh, logout, guards     | ✅ done |
| 3     | Households: creation, members, invitations, roles            | ✅ done |
| 4     | Dashboard (+ activity feed infrastructure)                   | ✅ done |
| 5     | Shopping lists                                               | ✅ done |
| 6     | Tasks + chores                                               | ⏳ next |
| 7     | Expenses, splits, balances                                   |         |
| 8     | Bills                                                        |         |
| 9     | Notes + in-app notifications                                 |         |
| 10    | Polish: responsive, a11y, empty/loading/error states, deploy |         |

## MVP definition of done

Two real users can: create accounts, create a household, invite each other, see members,
manage shopping lists, create/assign tasks, create/complete recurring chores, create and split
expenses, see who owes whom, create upcoming bills, see the dashboard and activity feed, and
receive basic in-app notifications — on desktop and mobile screen sizes.
