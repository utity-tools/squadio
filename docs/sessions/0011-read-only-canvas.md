# 0011: The read-only canvas and v0.1

- **Date:** 2026-10-26
- **Branch at close:** `docs/close-v0.1` · `main` at `aff8b23`, the merge of
  [#48](https://github.com/utity-tools/squadio/pull/48)
- **PRs:** merged [#34](https://github.com/utity-tools/squadio/pull/34) to
  [#38](https://github.com/utity-tools/squadio/pull/38),
  [#42](https://github.com/utity-tools/squadio/pull/42) to
  [#48](https://github.com/utity-tools/squadio/pull/48); this handoff closes v0.1

## Done

- **The six-PR canvas plan of [handoff 0010](0010-canvas-ui-foundation.md) is complete:**
  - open page data and the header ([#34](https://github.com/utity-tools/squadio/pull/34));
  - the compact layout with leaf columns ([#35](https://github.com/utity-tools/squadio/pull/35));
  - the tree view ([#36](https://github.com/utity-tools/squadio/pull/36));
  - the table view and the tree / table switch, with `?view` and `?collapsed` in the URL
    ([#42](https://github.com/utity-tools/squadio/pull/42), fit and selection fixes in
    [#44](https://github.com/utity-tools/squadio/pull/44));
  - the summary rail ([#45](https://github.com/utity-tools/squadio/pull/45)).
- **The summary rail** shows the ledger with rate access: the net margin with its status as an icon
  and a word, the key figures, the result lines and staff cost by category with rule j's warning.
  Warnings k, l and the budget cap replace every money figure with "—". Without rate access it
  shows team and hours. `?access=none` picks that state, derived in `currentAccessContext()`.
- **Follow-ups:**
  - the demo seeds one scenario per summary warning (202 over budget, 203 missing rate, 204 missing
    price), covered with axe in the browser ([#46](https://github.com/utity-tools/squadio/pull/46));
  - nodes and rows of a category without a rate carry a marker
    ([#47](https://github.com/utity-tools/squadio/pull/47));
  - fitting the tree to the view stops at 100% ([#48](https://github.com/utity-tools/squadio/pull/48)).
- **Operations:**
  - previews seed the demo organization ([#43](https://github.com/utity-tools/squadio/pull/43));
  - the deploy gate tolerates a lagging runs API
    ([#37](https://github.com/utity-tools/squadio/pull/37));
  - the post-mortem of the migrations that went to `neondb`
    ([#38](https://github.com/utity-tools/squadio/pull/38)).
- **The README** describes v0.1 with the live demo, screenshots and the claims CI checks.

## State

- v0.1 is live at <https://squadio.utitytools.com>, with production reseeded on 2026-10-26.
- After this PR merges: tag `v0.1.0` on `main` and publish a GitHub release (owner's OK first).
- Dependabot [#39](https://github.com/utity-tools/squadio/pull/39),
  [#40](https://github.com/utity-tools/squadio/pull/40) and
  [#41](https://github.com/utity-tools/squadio/pull/41) are open.

## Decisions

- **Margin status is the engine's.** The summary shows it exactly as `calculateScenario` returns it.
  The brief's "Empty scenario" row asked for no status, which domain.md does not define, so the
  brief now follows domain.md. A rule "no team, no status" would go into domain.md and the engine
  first.
- **Whole euros are formatting only.** The cents stay in the data, and there are no tooltips with
  exact figures yet.
- **From `md` up the page holds to the window height.** The canvas fits the window, and the team
  region and the rail scroll on their own. The rail is focusable so the keyboard can scroll it.
- **No performance figures in the README** until CI measures them ("Measured, not claimed").

## Gotchas

- **Stacked PRs and rebase merge.** `main` merges by rebase, so a merged base gets new SHAs. A PR
  stacked on it then conflicts with its own base: rebase only its commits with
  `git rebase --onto origin/main <old base tip>`. The force-push is the owner's.
- **GitHub deletes merged branches** (`delete_branch_on_merge`): after a merge, only
  `git fetch --prune` and delete the local branch.
- **Production is seeded by hand.** Previews seed on every deploy; production does not. After the
  seed changes, the owner runs `pnpm db:seed` with production's `DATABASE_URL`, copied from Vercel
  (Production, `squadio_app`), pasted with `read -rs` and without quotes or a `psql` wrapper.
- **`flex-1` beats `h-dvh`.** A flex item with `flex: 1` ignores `height`; `max-h-dvh` clamps it.
  A grid row also needs `minmax(0,1fr)`, or its content sets its height.
- **Local checks:**
  - stale `.claude/worktrees/*` folders break plain `pnpm lint` and the Turbopack build: use
    `--ignore-pattern '.claude/worktrees/**'`;
  - the untracked `.claude/launch.json` fails `format:check` locally: check tracked files only;
  - run E2E on a production build from a clean copy (`git archive HEAD | tar -x -C <dir>`) on a
    port other than 3000, which other sessions use.
- **Hooks:** guard-bash blocks any command that names a `.env` file other than `.env.example` and
  `.env.test`, even in an exclude list.

## Next

1. **Release v0.1.0**: tag `main` after this PR merges and publish the release notes.
2. **Maintenance**, one small PR at a time:
   - Dependabot #39, #40 and #41;
   - seed production on every deploy, in `deploy.yml`;
   - the post-mortem's follow-ups: the deploy asserts `current_database()` and `current_user`, a
     smoke test, and dropping the stale tables in `neondb`;
   - arrow keys in the theme switch, ignoring `.claude/worktrees` in ESLint, and the empty state's
     "como un árbol" text.
3. **Plan v0.2** (editing scenarios): the bench, the change model with optimistic locking and undo,
   drag and drop with keyboard parity, and choosing a scenario. Start from
   [docs/plan.md](../plan.md#v02-build-notes) and the brief's "What changes in v0.2".
