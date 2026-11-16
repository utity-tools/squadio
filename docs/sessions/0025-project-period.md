# 0025: A project's planned period and description

- **Date:** 2026-11-16
- **Branch at close:** `feat/project-period` · `main` at `dd0dd1c`
- **PRs:** this branch's pull request open
- **Checks:** unit, DB and every E2E in CI's Linux browser (`E2E_PORT=3200 pnpm test:e2e:linux`,
  192 passed); one `reviewer` on Sonnet and one `domain-guardian`

## Done

v0.3 slice 4a, the first of the two pull requests slice 4 was split into: a project has an optional
planned period and description, the project form edits a project, and new assignments start from
the period (docs/domain.md, "Planned period").

- **`feat(db)`:** migration `0011_project_period` adds `planned_start` and `planned_end` (`date`)
  and `description` (`text`) to `projects`, with `projects_planned_period_check` (both or neither,
  start not after end) and `projects_description_check` (not blank, at most 500 characters).
  Existing projects get neither. The table keeps its RLS policy.
- **`feat(projects)`, validation:** `plannedPeriodSchema` and `descriptionSchema`
  (`src/lib/projects/project-details.ts`): two blank dates are no period, one alone is
  `incomplete`, each must be a real day in the calendar's years (rule h, `CALENDAR_YEARS`), and an
  end before the start is the end's error. The description is trimmed, blank is none, and its
  length is counted in code points as Postgres's `char_length` does.
- **`feat(projects)`, the form:** `new-project-sheet.tsx` is still the only project form. It holds
  the description and the planned period, and with `trigger="edit"` it edits a project from its
  page («Editar proyecto»), filled in by `projectFormValues` with the price typed in the page's
  locale. `editProject` (`src/app/[locale]/projects/[id]/actions.ts`) parses it with the same
  `newProjectSchema` and saves it through `updateProject` (`src/db/create-project.ts`), then
  refreshes the page. `typedHundredths` moved from the category form to `src/lib/money/euros.ts`.
- **`feat(projects)`, the page:** the header names the planned period as a range of days after the
  price, and the description under it with its lines kept, for everyone.
- **`feat(scenarios)`:** `newMember` spans the planned period first, then the project span, then the
  next full month. The scenario's open part and its basis carry `plannedPeriod` and `description`
  (`plannedPeriodOf` in `src/db/scenario-basis.ts`, read by `loadScenario` and `loadPortfolio`);
  the «Añadir al equipo» dialog and a drop on the canvas pass it on.
- **`feat(demo)`:** the seed plans Internal tooling, 1 April to 31 December 2027, with a
  description. Its one scenario, First draft, has no extra costs, so no demo figure moves, in 4a or
  in 4b. `tests/e2e/project-period.spec.ts` reads both on the project page and adds an open role to
  First draft by the keyboard, with axe in light and dark themes.

## State

- Nothing half-done. The owner checks on this pull request's preview: as a visitor, open Internal
  tooling (period and description in the header), then First draft, add someone with «Añadir al
  equipo…» and see the project's span grow to 31 December. Signed in with GitHub, in an
  organization of their own: create a project with a period and a description, open «Editar
  proyecto» on its page, change them, clear the period, and add an assignment to a new scenario.

## Decisions

- **Editing a project needs rate access**, as creating one does: the form also writes the price,
  in `project_pricing`. The period and the description stay open to read.
- **A T&M project keeps its budget cap** when edited: the form does not hold it. A fixed price that
  becomes T&M drops its price, so it never turns into a cap.
- **Editing writes the pricing row if there is none** (an upsert): the demo's Internal tooling, and
  any fixed price project created without a price row, gets its price on the first save. Both
  reviewers caught that an update alone dropped it while saying «saved».
- **The period sits after the price in the header, shown only when set.** No «Sin periodo» chip:
  the form's help says what it does.
- **The demo's period is on Internal tooling,** not on Customer portal, so the guide case's
  figures stay pinned (domain, "Guide case") even once 4b moves undated recurring costs.
- **E2E cannot set a period:** it never signs in. Unit tests cover the form, DB tests
  `updateProject`, and the E2E reads the seeded one.

## Gotchas

- **Chromium gives a `dd` no name from `aria-labelledby`:** jsdom did, so the first E2E failed.
  Tests find the period by its `dt`'s text and the following `dd`.
- **A new assignment that spans the whole project reads «Todo el proyecto»** in the team table,
  not its dates: check the summary's «Duración del proyecto» instead.

## Next

1. **Slice 4b** (`feat/project-period-costs`): undated recurring costs follow the planned period in
   every scenario of the project (rule d), and the form says which ones will move and which chosen
   scenario's cost moves with them («qué costes recurrentes se moverán»). Assignments that start
   before or end after the period, and a period the team as a whole does not cover, are flagged on
   the team with how far outside they fall, never refused. Internal tooling's First draft (team
   until 29 September, period until 31 December) already shows the second case.
2. **Maintenance session:** Dependabot #108 and #109.
