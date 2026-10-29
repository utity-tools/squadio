# 0016: Choosing a scenario

- **Date:** 2026-10-29
- **Branch at close:** `docs/handoff-0016` · `main` at `1202753`, the merge of
  [#74](https://github.com/utity-tools/squadio/pull/74)
- **PRs:** merged [#72](https://github.com/utity-tools/squadio/pull/72),
  [#73](https://github.com/utity-tools/squadio/pull/73),
  [#74](https://github.com/utity-tools/squadio/pull/74)

## Done

- **[#72](https://github.com/utity-tools/squadio/pull/72): open roles on the bench.** Each category
  starts with an open-role card that can be dragged into the team. The card is hidden while
  searching names and kept with the category filter.
- **[#73](https://github.com/utity-tools/squadio/pull/73): slice 7a, choosing in the database.**
  - The `frozen_rates` and `frozen_cost_config` tables are restricted like the other money tables.
  - `chooseScenario` and `unchooseScenario` lock the version and check rate access. They refuse the
    demo template and teams with a category without a rate. Choosing unchooses the project's other
    scenario, and the project row is locked against a concurrent choice.
  - The loader costs a chosen scenario with its frozen values.
  - Migration 0007 backfilled the frozen rows of scenarios chosen before choosing froze them.
- **[#74](https://github.com/utity-tools/squadio/pull/74): slice 7b, choosing from the header.**
  - "Elegir escenario" or "Quitar la elección" opens a confirmation dialog. The dialog says what is
    frozen and what is not, and which scenario of the project it replaces. A team with a category
    without a rate gets an explanation and no confirmation.
  - A visitor's first choice makes their copy, like a first save. `src/db/visitor-write.ts` holds the
    write path that saving and choosing share.
  - The `setScenarioChoice` Server Action calls `refresh()` on success. The store sends a choice
    only once nothing is left to save, and it takes no step while the choice is on its way. Choosing
    locks the team at once; unchoosing unlocks it only with the next basis.
  - Focus and a status announcement survive the redirect to the copy. A `PendingChoice` ref in
    `ScenarioStoreProvider` carries them, and only the page whose id matches the store's takes
    them.
  - The owner tested the preview and found it fine. I repeated every manual test on a local
    production build, including Escape while the choice is on its way, with a delayed response.

## State

- Nothing open apart from this handoff. `main` is green.
- Slice 7 still has one part: **7c, the seed's dates** (see Next).
- Small polish, not started: the missing-rate dialog's title asks "¿Elegir «X»?" although X cannot
  be chosen. Better: "No se puede elegir «X»" / "“X” cannot be chosen". Do it in the release PR.

## Decisions

- **Slice 7 split** into 7a (database), 7b (UI) and 7c (seed dates).
- **Unchoosing exists in the UI.** Without it, the seed's chosen scenarios could never be edited.
- **The first write makes the copy, a save or a choice.** This is ADR 0011's 2026-10-29 amendment.
- **The seed's dates: option C, hybrid** (owner, 2026-10-29). The guide case keeps its fixed dates.
  The ongoing projects' chosen scenarios are anchored to the day the seed runs. See Next for why.

## Gotchas

- **On the redirect path, a Server Action still resolves with its full result,** not `undefined`.
  The template's page then closes its dialog before the copy's page mounts, so it can steal
  anything meant for the copy's page.
- **The header has two `role="status"` regions,** the save state and the choice. In E2E tests,
  filter them by text.
- **A scratch worktree** needs a real `pnpm install --frozen-lockfile --offline` (a symlinked
  `node_modules` fails) and `.env.test` sourced for `pnpm typecheck`.
- **Testing a clean visitor locally:** open `127.0.0.1` or `[::1]` instead of `localhost`. Cookies
  ignore the port but not the host.
- **The built-in browser runs on macOS,** so the page's undo shortcut there is ⌘Z, not Ctrl+Z.
- **The Vercel preview is behind Vercel's login.** Claude cannot sign in, so the owner tests it or
  Claude tests a local production build.

## Next

1. **7c: the seed's dates follow the day it runs.** Branch `feat/seed-dates`. Start with
   `git switch -c feat/seed-dates` and read `insertOngoingProjects` in `src/db/demo-seed.ts`.

   **Why.** The calendar knows 2026 to 2028. The chosen Delivery plan (2026-02-02 to 2027-03-31) and
   Run plan (2026-06-01 to 2027-05-28) give the bench its occupancy today. From 2027-04-01 they stop
   covering today, and the bench reads 0% for everyone, whatever the calendar. The plan's original
   rule, moving the dates a year forward when the calendar gains one, does not prevent that.

   **The rule (option C).**
   - The guide case (Plan A, Plan B and the other template scenarios) keeps its fixed 2027 dates.
     Its figures in `domain.md`, the README and the E2E tests stay as they are.
   - Only the ongoing projects' chosen scenarios move. Their spans are computed from the seed's day,
     with the same shape as today:
     - Delivery runs from the first working day about 9 months back to the end of the month about
       5 months ahead.
     - Run runs from about 5 months back to about 7 months ahead.
   - Both spans are clamped to the calendar's years. If the day falls outside them, the seed fails
     loudly: the calendar needs a new year.

   **Commits, tests first.**
   1. `docs`: the rule in `docs/domain.md` (the demo seed section) and the slice 7 row in
      `docs/plan.md`, before the code.
   2. `feat(lib)`: a pure `ongoingSpans(today, calendarYears)` in `src/lib/demo/`. Unit tests and
      fast-check properties: for every day inside the calendar, both spans contain it, stay inside
      the calendar's years, start on a working day and keep `start <= end`. A day outside the
      calendar is an error.
   3. `feat(db)`: `seedDemo(db, today)` takes the day. `scripts/seed-demo.mts` passes
      `madridToday(new Date())`, and the DB tests pass `SOME_DAY`. The seed freezes the chosen
      scenarios as it does now; their calendar working hours follow the anchored year. Update
      `demo-seed.db.test.ts` and any DB test that names the old dates.
   4. `test(e2e)`: the bench's occupancy figures no longer depend on the calendar date. Check
      `tests/e2e/bench.spec.ts`.

   **Open question for the owner.** The seed only runs on deploy (`deploy.yml`) and on previews.
   Without a deploy for months, production's dates go stale again. Should the daily clean-up
   workflow (`clean-up.yml`, 04:17 UTC) also reseed the demo template? Visitors' copies are left
   alone either way (ADR 0011). If yes, it is a fifth commit, and ADR 0006 gets an amendment.

   **Before the PR.** `pnpm test:e2e:linux`, the per-commit check with `set -o pipefail`, and the
   `reviewer` and `domain-guardian` reviews.

2. **Slice 8, the v0.2 release.**
   - The handoff, and a README with new screenshots (choosing, the bench, editing).
   - The missing-rate dialog title from State.
   - Tag `v0.2.0`.
