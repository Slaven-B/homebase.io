# Design system

HomeBase uses the **Untitled UI** design system (free Figma kit v2.0,
https://www.figma.com/design/c2BAK2bcFtnjCwigKgJnxE/) as its visual source of truth. Tokens
are taken from the kit and from the MIT-licensed `untitleduico/react` theme; the app implements
them as CSS custom properties and an Angular Material (M3) theme.

## Where things live

| File                                     | Purpose                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/styles/_tokens.scss`       | All tokens as `--hb-*` custom properties: scales, semantic colors, type, radius, shadow, spacing                                                   |
| `apps/web/src/styles/_theme-colors.scss` | Material palettes generated from the seed colors (`ng generate @angular/material:theme-color`)                                                     |
| `apps/web/src/styles.scss`               | `mat.theme(...)` + `mat.theme-overrides(...)` pinning Material to the exact Untitled UI values, component shape overrides, base styles             |
| `apps/web/src/styles/_utilities.scss`    | Shared layout/surface classes: `.hb-page-header`, `.hb-card`, `.hb-row`, `.hb-chip`, `.hb-alert`, `.hb-columns`, `.hb-section-title`, text helpers |
| `apps/web/src/app/shared/components/`    | Shared components: `app-page-header`, `app-empty-state`, `app-confirm-dialog`, `app-activity-feed`                                                 |

## Rules

1. **Components reference semantic tokens, never literal colors.** `color: var(--hb-text-tertiary)`,
   not `#475467` and not `var(--hb-gray-600)`. Scale steps (`--hb-gray-600`) are for defining
   semantics in `_tokens.scss` only.
2. **No page-specific chrome.** Page headers, cards, list rows, chips, empty states, loading and
   error states come from the shared classes/components. A page's own SCSS only holds what is
   unique to that page (a specific grid, a special widget).
3. **Material first.** Buttons, inputs, selects, dialogs, menus, snack bars and toggles are Angular
   Material components themed centrally. Don't restyle them locally; adjust the override in
   `styles.scss` if the system needs a change.
4. **4px grid.** Use `--hb-space-*` (4, 8, 12, 16, 20, 24, 32, 40, 48) for spacing.
5. **Responsive by default.** Layout with flex/grid + `gap`; stack to one column under ~720 px;
   nothing wider than the viewport except tables/code in their own scroll container.

## Color

Untitled UI scales (light mode). Semantic names mirror the kit: `bg`, `text`, `fg`, `border`.

| Role            | Token                                          | Value                                   |
| --------------- | ---------------------------------------------- | --------------------------------------- |
| Page background | `--hb-bg-secondary`                            | gray-50 `#F9FAFB`                       |
| Surface / card  | `--hb-bg-primary`                              | `#FFFFFF`                               |
| Primary text    | `--hb-text-primary`                            | gray-900 `#101828`                      |
| Secondary text  | `--hb-text-secondary`                          | gray-700 `#344054`                      |
| Tertiary text   | `--hb-text-tertiary`                           | gray-600 `#475467`                      |
| Borders         | `--hb-border-primary/secondary`                | gray-300 `#D0D5DD` / gray-200 `#EAECF0` |
| Brand           | `--hb-fg-brand-primary`, `--hb-bg-brand-solid` | brand-600 `#7F56D9`                     |
| Brand tint      | `--hb-bg-brand-primary`                        | brand-50 `#F9F5FF`                      |
| Error           | `--hb-fg-error-primary`                        | error-600 `#D92D20`                     |
| Warning         | `--hb-fg-warning-primary`                      | warning-600 `#DC6803`                   |
| Success         | `--hb-fg-success-primary`                      | success-600 `#079455`                   |

Status chips use the badge tokens: `.hb-chip--brand|error|warning|success` (50 background,
200 border, 700 text). Semantic status color is separate from the brand accent.

**Dark mode**: the free kit ships no dark variables. The token file is structured so a dark
block can redefine the semantic layer later (Untitled UI's own dark mapping: bg → gray-950/900,
text → gray-50/300, borders → gray-800/700, brand fg → brand-500). Tracked in the backlog.

## Typography

Inter (Google Fonts), weights 400 / 500 / 600 / 700. Untitled UI scale:

| Token             | Size / line-height | Use                  |
| ----------------- | ------------------ | -------------------- |
| `--hb-text-xs`    | 12 / 18            | chips, timestamps    |
| `--hb-text-sm`    | 14 / 20            | meta, secondary text |
| `--hb-text-md`    | 16 / 24            | body                 |
| `--hb-text-lg`    | 18 / 28            | card titles          |
| `--hb-text-xl`    | 20 / 30            | section headings     |
| `--hb-display-xs` | 24 / 32            | page titles (600)    |
| `--hb-display-sm` | 30 / 38            | dashboard greeting   |

Numbers that align in columns get `.hb-num` (`font-variant-numeric: tabular-nums`).

## Shape & elevation

Radius: controls 8 px (`--hb-radius-md`), cards 12 px (`--hb-radius-xl`), dialogs 16 px,
chips full. Shadows `--hb-shadow-xs` on cards, `--hb-shadow-lg` on floating surfaces.

## Adding a page

1. Start with `<app-page-header title="…">` (actions projected).
2. Content in `.hb-card`s; lists as `.hb-row` children; two-column detail with `.hb-columns`.
3. Loading: `<div class="hb-loading"><mat-spinner diameter="32"/></div>`.
4. Empty: `<app-empty-state icon="…" title="…" message="…">` with a projected primary action.
5. Errors: `.hb-alert.hb-alert--error` for page-level, snack bar for action-level.
