# 0024: A margin's figure never wraps in the rail

- **Date:** 2026-11-16
- **Branch at close:** `fix/rail-margin-percent-hint` · `main` at `6a21d74`
- **PRs:** [#113](https://github.com/utity-tools/squadio/pull/113) merged; this branch's pull
  request open

## Done

A follow-up to #113. To fit the rail at its narrowest, 280 px, #113 let a margin's % drop under its
amount: on the preview the owner saw «25.315 €» on one line and «· 58,9 %» on the next, and set a
rule: a figure, an amount with its %, never splits across two lines.

- **`fix(summary)`:** in «Cuenta de resultados» a margin's % is now its line's hint, as overhead's
  and buffer's are: «Margen directo · 45,6 %», or «Margen directo · % no aplicable» without revenue
  (new message `Summary.lines.marginHint.percentNotApplicable`). A pending margin has no hint. The
  amount column holds the amount alone, with `whitespace-nowrap` again, and the hint never breaks
  inside: it moves under the name whole. A screen reader names the row «Margen directo 45,6 %» and
  then reads the amount. The headline and `ScenarioAnnouncer` are unchanged.
- **`fix(scenario)`:** the chosen scenario's margin in `scenario-choice.tsx` keeps «amount · %» on
  one line, so `Summary.amountWithPercent` and `amountPercentNotApplicable` go back to a plain space.
  The projects table and the project page already had `whitespace-nowrap` (`TableCell numeric`).
- **Tests:** the 1000 px E2E also checks that every amount cell of the statement lays out on one
  line; unit tests read the margin rows with their hint and their accessible names.

## State

- Nothing half-done. The owner checks on this pull request's preview, at a window about 1000 px
  wide, the demo scenario Plan A: «Margen directo · 45,6 %» and «Margen neto · 31,7 %» by their
  names, and each amount on one line, in light and dark themes.

## Decisions

- **The % is a hint, not part of the amount** (owner, option A): the amount column stays one figure
  wide at every rail width, and the hint follows the pattern the statement already had.

## Next

1. **Slice 4, project and period** (`feat/project-period`): read `docs/domain.md`, «Planned
   period», first.
2. **Maintenance session:** Dependabot #108 and #109.
