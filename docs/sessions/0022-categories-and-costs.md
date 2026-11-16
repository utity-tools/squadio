# 0022: Categories and costs

- **Date:** 2026-11-16
- **Branch at close:** `feat/category-costs` · `main` at `a31844a`
- **PRs:** [#111](https://github.com/utity-tools/squadio/pull/111) merged; this branch's pull
  request open

## Done

v0.3 slice 3b, the second of the three pull requests slice 3 was split into: on a project's page,
a signed-in member with rate access creates and edits the organization's categories with their
costs, and creates the project's scenarios.

- **`feat(money)`:** `parsePercent` (`src/lib/money/percent.ts`) reads «31,17 %» or «31.17%» into
  basis points, sharing `parseEuros`'s string-only reader (`parseHundredthsIn`).
- **`feat(categories)`:** `categoryFormSchema` (`src/lib/categories/category-form.ts`) validates a
  category with its whole rate; a monthly salary × 12 or 14 payments is stored as the year's.
  `categoryFormValues` fills the form back in the page's locale, a new category with the
  Consultancy template's 31% and 3,000 € (`CONSULTANCY_RATE_DEFAULTS`). `summarizeCategory` gives a
  row's fully loaded cost, cost per hour (the manual one when set) and sell rate, or pending.
- **`createCategory`, `updateCategory` and `loadCategoryCosts`** (`src/db/categories.ts`): one
  `withOrganization` transaction each, rate access checked first (ADR 0005); a name the organization
  already uses comes back as `name-taken`, another organization's category as `not-found`. No
  migration: `categories` and `category_rates` already had every column.
- **`saveCategory`**, the Server Action in `src/app/[locale]/projects/[id]/actions.ts`: organization
  from the session's membership, locale from the form, `refresh()` after saving.
- **«Categorías y costes»** (`src/components/projects/category-costs.tsx`, board 06): the table with
  «i» on fully loaded cost and cost per hour, «Completa» or «Pendiente», rule j's small-category
  warning, and the note on what the sell rate is for under the project's pricing model.
  «Añadir categoría» and each row's pencil open `category-sheet.tsx`. Shown with rate access only;
  write buttons for a signed-in member only.
- **`feat(scenarios)`:** «Crear escenario» (`new-scenario-button.tsx`, `src/db/create-scenario.ts`,
  `createNewScenario`) creates the project's next empty scenario, «Escenario N» in the form's
  locale, and opens it in the editor. Any member may: a scenario holds no money. The server refuses
  it until the organization has a category (`no-categories`), and the button says so.

## State

- Nothing half-done. The owner checks on this pull request's preview, signed in with GitHub, in an
  organization of their own: add a category with a yearly and one with a monthly salary, edit one
  (rename and change the sell rate), try a repeated name, then «Crear escenario» and place an open
  role of the new category in the editor.

## Decisions

- **No migration; the sell rate stays required** (owner, option A). A category has its whole rate
  or none, so «Pendiente» means the cost and the sell rate are both missing. Making the sell rate
  optional, as board 06 draws it, would touch the engine, frozen rates and pending corrections.
- **The first scenario is part of 3b** (owner, option 1).
- **Rule j's warning shows on this card and in the edit sheet too:** docs/domain.md asks for it
  wherever a rate is read or edited. 3c adds it to the people page.
- **Switching the salary between yearly and monthly empties it,** rather than keeping a year's
  figure under a month's label.
- **Left out:** deleting a category, board 06's «Deshacer» toast (a visible status line says
  «Categoría «X» guardada» instead), «Primeros pasos» (ADR 0012), «Editar proyecto», and a page of
  its own for categories in the sidebar.

## Gotchas

- **`next-intl/server` is refused in Server Action files** (`src/i18n/server-actions.test.ts`), so
  `createNewScenario` names the scenario with `createTranslator` over the form's locale's messages.
- **Radix's radio group needs `ResizeObserver`,** which jsdom lacks: the sheet's test stubs it.
- **The card's note says «precio cerrado»,** so E2E finds the pricing-model chip with
  `getByText(…, { exact: true })`.
- **`pnpm typecheck` needs env variables** in a fresh worktree: `set -a; . ./.env.test; set +a`.

## Next

1. **Slice 3c:** the people page, with rule j's small-category warning.
2. **Maintenance session:** Dependabot #108 and #109.
