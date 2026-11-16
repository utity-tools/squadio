# 0021: Creating a project

- **Date:** 2026-11-16
- **Branch at close:** `feat/new-project` · `main` at `ba5a5d9`
- **PRs:** [#110](https://github.com/utity-tools/squadio/pull/110) merged; this branch's pull
  request open

## Done

v0.3 slice 3a, the first of the three pull requests the owner split slice 3 into: a signed-in
member with rate access creates a project from `/projects`.

- **`feat(money)`:** `parseEuros` in `src/lib/money/euros.ts` reads an amount as a person types it
  in the page's locale («200.000,00 €», «€200,000.00») into integer cents, with string operations
  only, and refuses anything over `numeric(12,2)`. Property-tested against what `Intl` prints.
- **`feat(projects)`:** `newProjectSchema` (`src/lib/projects/new-project.ts`) validates name,
  client (1 to 100 characters, as the database checks), pricing model and the optional fixed price
  (at least 1 cent). A price sent with time and materials is dropped.
- **`createProject`** (`src/db/create-project.ts`) writes the project and its one
  `project_pricing` row in a single `withOrganization` transaction, after checking rate access as
  ADR 0005 asks. The price is null when it is not known: revenue and margin stay «Pendiente». No
  migration: `projects` and `project_pricing` already had every column.
- **`createNewProject`**, the Server Action in `src/app/[locale]/projects/actions.ts`, takes the
  organization from the session's membership, never from the form, and the locale from the form
  (handoff 0020), and leads to `/projects/<id>`.
- **«Nuevo proyecto»** (`src/components/projects/new-project-sheet.tsx`, board 05): a side sheet
  with name, client, the pricing model as two radio cards and, for a fixed price, the optional
  price with «Sin precio, ingresos y margen quedarán pendientes». It sits above the list, and as
  «Crear proyecto» in the empty state. `OrganizationAccess` gained `member`.

## State

- Nothing half-done. The owner checks on this pull request's preview, signed in with GitHub, that
  creating a fixed-price project (with and without a price) and a T&M project leads to each
  project's page, and that `/projects` lists them.

## Decisions

- **Only a signed-in member with rate access sees the button;** a visitor, the demo and
  `?access=none` see none, and the server refuses anyway. An adopted example organization is the
  member's own, so it offers it.
- **Left out of the form:** the board's «Paso 2 de 5» (onboarding follows ADR 0012), T&M's budget
  cap, and the description, planned period and target margin (slice 4).
- **Creating a project makes no scenario.** The project's page shows its empty state. How the
  first scenario is created is still open: decide it with 3b.

## Gotchas

- **React resets a form after its `action` runs,** losing what was typed when validation fails.
  The sheet submits through `onSubmit` and `startTransition` instead.
- **Radix focuses the close button first** in a sheet; `onOpenAutoFocus` moves it to the name.
- **E2E never signs in,** so it only checks that a visitor is not offered the button. The signed-in
  path is covered by unit and database tests and the owner's preview check.
- **`expectHydrated` takes a locator,** not a page; `tsc` does not check `tests/e2e`, `next build`
  in `pnpm test:e2e:linux` does.

## Next

1. **Slice 3b:** categories and their costs inside the project's page (board 06), and how a
   project's first scenario is created.
2. **Slice 3c:** the people page, with rule j's small-category warning.
3. **Maintenance session:** Dependabot #108 and #109.
