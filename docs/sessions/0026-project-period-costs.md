# 0026: Recurring costs follow the planned period, and the team flags what falls outside it

- **Date:** 2026-11-16
- **Branch at close:** `feat/project-period-costs` · `main` at `0e03cd9`
- **PRs:** this branch's pull request open
- **Checks:** unit, DB and every E2E in CI's Linux browser (`E2E_PORT=3200 pnpm test:e2e:linux`,
  195 passed);
  one `reviewer` on Sonnet and one `domain-guardian`, no blockers

## Done

v0.3 slice 4b, the second of the two pull requests slice 4 was split into (docs/domain.md,
"Planned period", rule d).

- **`feat(costing)`:** the engine's scenario input takes `plannedPeriod` (not frozen), and an
  undated recurring cost spans it, or else the project span as before. Without a period and
  without assignments it is still an error on the cost's dates. The period is validated (ISO days,
  end not before start, on `end`). `StoredScenario.plannedPeriod` is required, so `toEngineInput`,
  `engineBasis`, `loadScenario` and `loadPortfolio` all carry it; the guide case passes `null`
  (Customer portal has no period), so its figures do not move. Two fast-check properties: an
  undated cost over a period costs what the same cost dated over it does, and with a period it
  does not depend on the team. DB tests: a chosen scenario's cloud follows a new period and goes
  back to the team's span when it is cleared, and the portfolio costs it as the page does.
- **`feat(projects)`:** with rate access, each portfolio scenario's money lists its undated
  recurring costs (id and label, no amount). The project form, editing, shows them in a warning
  once the typed period is valid and differs from the saved one, by scenario, and names the chosen
  scenario whose cost moves with them (`costsFollowingPeriod`, `src/lib/projects/period-change.ts`).
  A cleared period says they go back to each scenario's team. Never a block.
- **`feat(scenarios)`:** `outsidePeriod` and `uncoveredPeriod` (`src/lib/scenarios/period-flags.ts`)
  count calendar days in UTC. Each card carries `outsidePeriod`: the tree's node shows «Fuera del
  periodo» with the detail for screen readers and in its tooltip; the table's dates cell shows the
  detail («Acaba 31 días después del periodo previsto»). The views' bar notes a period the team
  does not cover («El equipo acaba 93 días antes del periodo previsto»). Open to everyone.
- **`test(e2e)`:** `tests/e2e/period-flags.spec.ts` on First draft: the bar's note, then the end
  moved to 31 January 2028 by the keyboard, flagged on the row and the node, the note gone; axe in
  light and dark themes, and English.

## State

- Nothing half-done. The owner checks on this pull request's preview: as a visitor, open Internal
  tooling's First draft (bar: «El equipo acaba 93 días antes…»), edit the developer's end past
  31 December and see the row's and the node's flags. Signed in, in an adopted copy: «Editar
  proyecto» on Customer portal, set a period and read which costs move (Plan A's and Plan B's
  Cloud, and the chosen one if any), save, and see Plan A's cloud cost follow it.

## Decisions

- **Days, not working days,** measure how far outside the period an assignment falls: prorating
  and the period are by calendar day.
- **The notice over-warns:** it lists every undated recurring cost whenever the period changes,
  even when the new period equals a scenario's span and so moves nothing. Safe, and simpler to
  read.
- **A scenario without a team flags nothing:** there is nothing to cover the period with yet.
- **The E2E is its own `test(e2e)` commit,** after the feature, as in earlier slices.

## Gotchas

- **The reviewer's should-fix, left for its own task:** a scenario without assignments that has an
  undated recurring cost makes the engine throw a validation error when its project has no period,
  which breaks that scenario's page and Inicio for the whole organization (`loadPortfolio` does not
  isolate one scenario). Removing the whole team already reached it before this branch; now clearing
  a period can too. Only seeded data has extra costs today (no UI adds them), so only an adopted
  copy's Customer portal can get there. Fix both paths together: either the engine leaves that line
  undetermined with a warning (a domain change to rule d first) or the actions refuse the state.
- **macOS has no Playwright browser** in this checkout: run E2E in Linux (`pnpm test:e2e:linux`)
  with CI's synthetic auth values exported, as the memory says.

## Next

1. **Engine robustness** (`fix/undated-recurring-without-span`): the gotcha above.
2. **Slice 5, v0.3 release**, once the owner's processing review is done.
3. **Maintenance session:** Dependabot #108 and #109.
