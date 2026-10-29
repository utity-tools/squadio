# 0017: Seed dates, the daily reseed and the v0.2 release

- **Date:** 2026-10-29
- **Branch at close:** `docs/release-v02` · `main` at `a6eabc7`, the merge of
  [#77](https://github.com/utity-tools/squadio/pull/77)
- **PRs:** merged [#75](https://github.com/utity-tools/squadio/pull/75),
  [#76](https://github.com/utity-tools/squadio/pull/76),
  [#77](https://github.com/utity-tools/squadio/pull/77); this one is the release PR

## Done

- **[#76](https://github.com/utity-tools/squadio/pull/76): slice 7c, the seed's dates.**
  - The guide case keeps its fixed 2027 dates. The chosen Delivery and Run plans are anchored to
    the day the seed runs (`docs/domain.md`, "The demo's dates").
  - `ongoingSpans(today, calendarYears)` in `src/lib/demo/` is pure, with fast-check properties.
    It covers the day, stays inside the calendar's years, and starts and ends on working days.
  - `seedDemo(db, today)` takes the day: `pnpm db:seed` passes today in Madrid, and DB tests pass
    `SOME_DAY`. A day outside the calendar fails before anything is written.
  - The bench E2E test now checks the exact occupancy figures.
- **[#77](https://github.com/utity-tools/squadio/pull/77): the daily reseed.**
  - The deploy's seed and smoke test steps moved into composite actions
    (`.github/actions/seed-demo`, `.github/actions/smoke-test`).
  - `clean-up.yml` has two new jobs. `demo-gate` runs without secrets: it finds the commit
    production last deployed and skips while a deploy is queued or running. `demo` checks out that
    commit, never `main`'s tip, and shares the `deploy-production` concurrency group. Once it holds
    the group, it checks the commit again, then seeds and smoke tests.
  - ADR 0006 is amended, and the runbook covers the edge cases: a deploy replaced in the group, a
    rollback, and a calendar out of years.
- **The release PR:**
  - The missing-rate dialog's title is now "No se puede elegir «X»" / "“X” cannot be chosen".
  - The README describes v0.2, with new screenshots and a chosen scenario in the demo table.
  - This handoff.

## State

- After this PR merges: tag `v0.2.0` and publish the GitHub release (see Next).
- **Not verified yet:** the new jobs of the Clean up workflow. A scheduled workflow cannot run in a
  PR. Expect three green jobs from the owner's manual run (**Clean up → Run workflow**, `main`), or
  from tomorrow's 04:17 UTC run.

## Decisions

- **Seed dates, option C** (owner): only the ongoing chosen scenarios move with the seed's day.
- **Production reseeds daily** (owner). The reseed runs the code production runs, never `main`'s
  tip, which can be ahead of production's schema (ADR 0006, 2026-10-29 amendment).
- **Run plan's end** is the last working day of its month, 2027-05-31 for `SOME_DAY`, instead of
  the 28th.

## Gotchas

- **`src/db/demo-seed.test.ts` reads the smoke test's URL and name** from
  `.github/actions/smoke-test/action.yml`. Moving that text without updating the test turned CI
  red. On CI-only branches, run the full per-commit check too, unit tests included.
- **The `guard-bash` hook blocks any shell text that names an env file other than the two
  versioned ones,** heredocs included. Write such files with Write or Edit.
- **The built-in browser keeps a visitor cookie between sessions,** so the demo's links redirect to
  that visitor's copy. Check a clean visitor from a fresh Playwright context, or on `[::1]`.
- **README screenshots** come from a local production build. Run `pnpm db:seed`, so the bench's
  occupancy is today's, then `pnpm build && node_modules/.bin/next start --port 3100`. Capture with
  Playwright (`chromium` from `@playwright/test`) in a fresh context at 1440×900, with
  `colorScheme` set per image and the page on `127.0.0.1`, so no visitor cookie applies. Wait for
  the bench and a moment for the count-up before each capture.

## Next

1. **Release v0.2.0** once this PR merges. Run `git switch main && git pull --ff-only`, then tag the
   merge commit `v0.2.0`, push the tag and publish the GitHub release with the owner's approved
   notes.
2. **Plan v0.3:** scenario comparison, duplicating scenarios, and merging teams with animation
   (`docs/plan.md`, roadmap). Like v0.2, start with a docs PR: slices, `domain.md` rules, and ADRs
   where a decision needs one.
