# 0008: Costing engine

- **Date:** 2026-10-21
- **Branch at close:** `docs/handoff-0008` · `main` at `b9e45aa`
- **PRs:** merged [#22](https://github.com/utity-tools/squadio/pull/22) (costing engine)

## Done

- The owner's four spec decisions went into [`docs/domain.md`](../domain.md) first, then tests,
  then code, each as a fixup folded into the matching commit.
- PR 3 merged as [#22](https://github.com/utity-tools/squadio/pull/22), five commits:
  - `feat(money)`: numeric strings to integer cents and basis points
    ([`src/lib/money`](../../src/lib/money)).
  - `docs`: rounding, proration, margin status and the guide case dates.
  - `feat(calendar)`: working days with the national holiday calendar
    ([`src/lib/calendar`](../../src/lib/calendar)).
  - `feat(costing)`: a scenario's cost, revenue and margin
    ([`src/lib/costing`](../../src/lib/costing)).
  - `test(costing)`: the five domain invariants with fast-check.
- Every commit passes lint, typecheck, format and tests on its own. The last one runs 398 tests;
  coverage is 99.2% of statements and 100% of lines.
- domain-guardian and reviewer found no blockers; their suggestions are applied.
- CI on #22 was green on every job, including the per-commit check and the preview deploy.

## State

- No open work. `main` at `b9e45aa`; `feat/costing-engine` and its worktree are deleted (GitHub had
  already deleted the remote branch on merge).

## Decisions

- **`CostSettings`, not `CostConfig`**, for the engine's input type; the domain.md argument is
  `costSettings`. The glossary has a "Cost settings" row, kept apart from the "Cost config" entity.
- **One Zod input object**, so every issue path starts with `scenario.`, `rates.`, `costSettings.`
  or `targetMargin`. Cross-field checks use `when` so one bad field gives one issue.
- **Calendar working hours have up to 3 decimals**, computed in integer thousandths.
- **Out-of-range results throw a `RangeError`:** a result line beyond `numeric(12,2)`, or a margin %
  or effective rate beyond a safe integer.
- No ADR: the four decisions are spec details of rules d and g, recorded in domain.md under
  Rounding, margin status, Validation and Invariants.

## Gotchas

- `pnpm typecheck` needs env vars locally: `set -a; . ./.env.test; set +a` (CI sets the same
  synthetic values).
- Zod 4 runs refinements even after a non-fatal issue: use `when` to avoid cascading issues.
- `git commit --fixup=reword:` refuses `-m`. Use `GIT_EDITOR="cp msgfile"` with an
  `amend! <subject>` header.
- CI jobs sat queued for a while waiting for `ubuntu-latest` runners with GitHub reporting no
  incident; they ran later without any change. If it lasts, check the Actions minutes in Settings →
  Billing.
- The canary Stop hook checked the first text after the owner's prompt, usually a progress note,
  so it failed on replies that did start with "Capitán". Fixed in [#23](https://github.com/utity-tools/squadio/pull/23): it now
  checks the last text of the turn.
- `pnpm lint` in the main checkout also lints the worktrees under `.claude/worktrees/` and fails on
  their files. Lint the changed files directly until ESLint ignores that folder.
- The guard hook blocks any command containing `git push` while `main` is checked out, even
  `git push origin --delete <branch>`. Run branch deletions from another branch.

## Next

1. Finish v0.1: the read-only canvas with seed data, rendering a scenario's team and its cost
   through `calculateScenario`. Plan it with [ADR 0008](../adr/0008-simulator-interaction-stack.md)
   and the v0.2 build notes in [`docs/plan.md`](../plan.md).
2. Give rule j's warning (a category with fewer than 3 people reveals a salary) a home: decide
   where people are counted, in the engine or in the health checks of v0.4.
3. Still open from [handoff 0007](0007-preview-deployments.md): `deploy.yml` with `pipefail`,
   `sslmode=verify-full`, and a first page that verifies a preview reaching Neon at run time.
