# 0009: Coordinating v0.1

- **Date:** 2026-10-21
- **Branch at close:** `main` · `main` at `97f3433`
- **PRs:** merged [#23](https://github.com/utity-tools/squadio/pull/23) (canary hook),
  [#24](https://github.com/utity-tools/squadio/pull/24) (handoff 0008),
  [#25](https://github.com/utity-tools/squadio/pull/25) (rate access in the database),
  [#26](https://github.com/utity-tools/squadio/pull/26) (canvas design brief),
  [#27](https://github.com/utity-tools/squadio/pull/27) (small categories, rule j); open
  [#28](https://github.com/utity-tools/squadio/pull/28) (staff cost by category spec)

## Done

- Closed PR 3 ([#22](https://github.com/utity-tools/squadio/pull/22), costing engine) and wrote
  [handoff 0008](0008-costing-engine.md).
- Fixed the canary Stop hook ([#23](https://github.com/utity-tools/squadio/pull/23)): it checked
  the first text of the turn, a progress note in all eight failures found in the transcripts, and
  now checks the last one.
- Specified rule j in [`docs/domain.md`](../domain.md#small-categories): 1 or 2 active people in a
  category, counted organization-wide, outside `calculateScenario`. Implemented as
  `findSmallCategories` in [`src/lib/rates`](../../src/lib/rates) ([#27](https://github.com/utity-tools/squadio/pull/27)).
- Rate access is enforced by the database ([#25](https://github.com/utity-tools/squadio/pull/25),
  ADR 0005): `app.has_rate_access`, `withOrganization` takes an access context, and the guard test
  knows the restricted tables.
- The canvas design brief is merged with direction A, "ledger rail"
  ([`docs/design/canvas-brief.md`](../design/canvas-brief.md), [#26](https://github.com/utity-tools/squadio/pull/26)).
- Work ran in parallel sessions: v0.1 backend, canvas design, and staff cost by category.

## State

- **#28 open**, CI green, up to date with `main`: the spec of staff cost by category (option B).
  First in the merge queue.
- **`feat/staff-cost-by-category`** (local only, after #28): `bc400c3 feat(costing): break staff
cost down by category`, on top of the spec commit. Not reviewed or pushed yet.
- **`feat/v01-schema`** (local only, PR 3 of the backend plan), three commits on an older `main`:
  the `moneyCents`, `basisPoints` and `weeklyHours` column types, the six structural tables,
  the restricted tables. reviewer and domain-guardian found no blockers. Their suggestions (stronger
  tests, doc wording) are **not applied yet**: the session stopped right before the fixups.
- Not started: PR 4 of the backend plan, the demo seed in Neon and the loader. No frontend: the
  canvas waits for its implementation plan, now that the design is merged.

## Decisions

- **Backend first, no frontend without a design.** The owner stopped the canvas UI until a design
  existed; the brief is now merged.
- **Demo data in Neon:** one fixed demo organization with rate access, synthetic data only.
- **Staff cost by category, option B:** each category line is rounded once and staff cost is the
  sum of the rounded lines, as rule g does for direct cost. The guide case does not move.
- **One PR ready to merge at a time.** The ruleset requires up-to-date branches and a personal
  account has no merge queue, so every merge left the other PRs behind. Sessions ask the
  coordinating session for their turn, rebase right before pushing, and check that
  `mergeStateStatus` is not `BEHIND` before asking the owner to merge.

## Gotchas

- To bring a PR up to date, use `gh pr update-branch <n> --rebase` (GitHub rebases on the server).
  A local `git rebase` plus `git push --force-with-lease` was blocked by the permission classifier
  as destructive.
- The guard hook blocks `gh pr merge` (only the owner merges) and any `git push` while `main` is
  checked out.
- `pnpm lint` in the main checkout also lints `.claude/worktrees/`; lint the changed files
  directly until ESLint ignores that folder.

## Next

The merge queue, in order. Push nothing until the previous PR is merged.

1. **Owner:** merge [#28](https://github.com/utity-tools/squadio/pull/28).
2. **`feat/v01-schema`:** apply the reviewer and domain-guardian suggestions as fixups, autosquash,
   check every commit with `git rebase --exec` (DB tests need `docker compose up -d --wait`), rebase
   onto `main`, then push and open the PR after the owner approves. First command:
   `git log --oneline main..feat/v01-schema`.
3. **`feat/staff-cost-by-category`:** review (reviewer, domain-guardian), rebase onto `main`, push
   and PR.
4. **PR 4, demo seed and loader:** plan first. Open questions for the owner: how the annual cost
   enters the engine exactly, a fixed-price project without a price, delete behaviour, and whether
   the seed also runs in production.
5. **Canvas implementation plan** from the merged design brief, for the owner to approve.
6. Follow-ups: make ESLint ignore `.claude/worktrees/`; this handoff goes into the first branch
   pushed next (`docs: add session handoff 0009`).
