# 0027: An undated recurring cost without a span is undetermined, not an error

- **Date:** 2026-11-16
- **Branch at close:** `fix/undated-recurring-without-span` · `main` at `3e08438`
- **PRs:** this branch's pull request open
- **Checks:** unit (1776), DB (417) and every E2E in CI's Linux browser
  (`E2E_PORT=3200 pnpm test:e2e:linux`, 195 passed); lint, types and tests on each commit; one
  `reviewer` on Sonnet and one `domain-guardian`, no blockers

## Done

The gotcha of handoff 0026. A scenario without assignments, of a project without a planned
period, with an undated recurring extra cost made `calculateScenario` throw a validation error.
That broke the scenario's page, and Inicio for the whole organization, since `loadPortfolio` costs
every scenario. Removing the whole team or clearing the period got there. The owner chose option
(a): the engine leaves the line undetermined, as docs/domain.md's "Partial results" does for a
missing rate or price.

- **`docs(domain)`:** rule d, the Formulas paragraph, the Partial results table and its dependency
  list, Planned period, Pending corrections and the fill-in invariant. A missing span is the third
  thing an undetermined line can miss, after the rates and the price.
- **`fix(costing)`:** the engine's `superRefine` no longer rejects the state. An undated recurring
  cost without a span is `{ undetermined: [{ code: "missingPeriod" }] }`, and so are the lines built
  on it (direct cost, buffer, total cost, both margins and their %). Overhead and a % over staff
  cost stay determined. `missingOf` orders rates, price, then period, and the result's warnings
  include `missingPeriod`. The fill-in property of `invariants.test.ts` now also drops the period
  of a scenario without a team: `scenarioArb` gives such a scenario a period instead of dating its
  costs. The summary's `Amount.missing` gains `period`; the ledger says «Falta el periodo
  previsto», after whatever else the line misses («Falta el precio. Falta el periodo previsto»), and
  warns «Falta el periodo previsto».
- **`feat(dashboard)`:** Inicio's corrections gather `missingPeriod` once per project, after the
  missing price and before the budget cap, and lead to the project, where the period is set
  («Periodo previsto de {project}» · «costes y márgenes pendientes»).
- **`test(db)`:** with the guide scenario's team deleted in a copy, its page and the organization's
  portfolio load, with and without rate access; Inicio lists the correction. Both tests fail on
  `main`'s engine.

## State

- Nothing half-done. Only seeded data has extra costs (no UI adds them), so the owner checks it in
  an adopted copy: remove Plan A's whole team on Customer portal, save, and see Cloud «Pendiente ·
  Falta el periodo previsto», the warning, and Inicio's «Periodo previsto de Customer portal».

## Decisions

- **Undetermined, not refused:** refusing would block two legitimate edits (removing the last
  person, clearing a period) and would not repair data that already reaches the state.
- **Choosing is unchanged:** an empty team cannot be chosen, and a chosen team cannot be edited, so
  a chosen scenario never misses a span.
- **No E2E of its own:** no UI adds an extra cost yet, so the state cannot be reached in the
  demo's E2E flows; the unit tests cover the ledger and the dashboard, the DB tests the loaders.

## Review

- **Reviewer, should-fix, done:** the «what is missing» text named a span only without categories;
  it now appends the span to whatever else a line misses, so a future rule cannot drop it silently.
  Nits done: the corrections loop names `budgetCapExceeded` explicitly, and the Pending corrections
  paragraph is rewrapped.
- **Domain guardian, should-fix, done:** the glossary's Pending correction and Undetermined entries
  name the planned period and the span; the summary paragraph of Partial results says the engine
  leaves the net margin undetermined without a span.

## Gotchas

- `pnpm typecheck` and the E2E need `.env.test` exported (`set -a; . ./.env.test; set +a`): it
  holds the auth variables CI sets too.

## Next

1. **Slice 5, v0.3 release**, once the owner's processing review is done.
2. **Maintenance session:** Dependabot #108 and #109.
