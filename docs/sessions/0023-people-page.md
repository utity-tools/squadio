# 0023: The people page

- **Date:** 2026-11-16
- **Branch at close:** `feat/people-page` · `main` at `c01e5ad`
- **PRs:** [#112](https://github.com/utity-tools/squadio/pull/112) merged; this branch's pull
  request open

## Done

v0.3 slice 3c, the last of the three pull requests slice 3 was split into: `/people` lists the
organization's people, and a signed-in member with rate access adds and edits them. The same pull
request fixes the editor's rail at a window about 1000 px wide.

- **`feat(people)`:** `personFormSchema` (`src/lib/people/person-form.ts`) validates name, category,
  weekly hours (comma or point, above 0 and up to 168, reusing `parseWeeklyHours`), the optional
  area and «Activa». `personFormValues` fills the form back in the page's locale; a new person
  starts active with Config's weekly hours. `activePeopleAfterSaving`
  (`src/lib/rates/small-categories.ts`) counts a category's active people as they will be once a
  person is saved, for rule j's warning before saving.
- **`createPerson`, `updatePerson` and `loadPeople`** (`src/db/people.ts`): one `withOrganization`
  transaction each. Writing checks rate access first; another organization's category comes back as
  `category-not-found` (the composite foreign key refuses it), another organization's person as
  `not-found`. `loadPeople` reads people by name with today's occupancy (chosen scenarios, Madrid),
  and only with rate access which categories are pending and which are small. No migration.
- **`savePerson`**, the Server Action in `src/app/[locale]/people/actions.ts`: organization from the
  session's membership, `refresh()` after saving. It needs no locale: weekly hours take a comma or
  a point in either.
- **The page** (`src/app/[locale]/people/page.tsx`, `src/components/people/`, board 07): the table
  with name, category, weekly hours, area, «Ocupación hoy» with its «i», and «Activa» or
  «Inactiva»; rule j's chip next to a small category's people. «Añadir persona» and each row's
  pencil open `person-sheet.tsx`, which warns before a save leaves the category with 1 or 2 active
  people, says when the chosen category is pending, and keeps open for the next person with
  «Añadir otra después». «Personas» joins the sidebar and the ☰ menu for everyone.
- **`fix(summary)`:** at its narrowest the rail is 280 px (any window up to 1272 px wide), and the
  result statement measured 341 px: the margin's «91.203 € · 45,6 %» and «SUBTOTAL ⓘ Coste
  directo» never broke. A subtotal's tag now sits on its own line, a margin's % may go under its
  amount (a no-break space keeps «·» with the %), and staff cost by category sets its figures at
  12 px with headers that may break. An E2E at 1000 px checks no table passes the rail's padding.

## State

- Nothing half-done. The owner checks on this pull request's preview, signed in with GitHub, in an
  organization of their own: open «Personas», add a person to a category with no one yet (rule j's
  warning shows in the sheet, and the chip in the table after saving), add two more with «Añadir
  otra después» until the warning goes, edit one (deactivate them, move them to another category),
  and open a scenario at a window about 1000 px wide to see every amount in «Cuenta de resultados».

## Decisions

- **Writing a person needs rate access** (owner, option A), checked in the app: `people` stays a
  structural table that everyone reads, with no RLS change and no migration. A write moves rule j's
  count, which only users with rate access see. Recorded in `docs/domain.md` (Person).
- **«Añadir otra después» keeps the category** and empties the other fields: the next person is
  likely of the same one. The sheet's status line announces each save, so the page's does not repeat
  it from behind the dialog.
- **Two people may share a name:** there is no unique constraint, and real teams have namesakes.
- **«Pendiente» replaces board 07's «Sin tarifa»** next to the category, as a note under the picker.
- **Open roles are not created on this page:** they are added to a scenario's team in the editor,
  as v0.2 does. The page says so.
- **Left out:** deleting a person (deactivating is the way), board 07's «Primeros pasos» (ADR
  0012), filters and search on the page, and the CSV import (boards 10 to 13).

## Gotchas

- **Measuring the rail in the browser pane:** Next.js keeps the previous page hidden in the
  document, so `querySelector("aside")` may find the hidden one. Filter by `offsetParent`.
- **Opening a `<details>` by hand in the pane logs a hydration mismatch;** it is the script's, not
  the app's.
- **Playwright has no macOS browsers installed here:** run E2E with `E2E_PORT=3200 pnpm
test:e2e:linux`, after exporting `.env.test` and CI's synthetic auth values.

## Next

1. **Slice 4, project and period** (`feat/project-period`): the project's planned period and
   description, new assignments starting from it, and assignments outside it flagged. Read
   `docs/domain.md`, «Planned period», first.
2. **Maintenance session:** Dependabot #108 and #109.
