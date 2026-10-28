# 0015: Bench, keyboard editing and E2E in CI's Linux browser

- **Date:** 2026-10-28
- **Branch at close:** `docs/handoff-0015` · `main` at `c3f9ddd`, the merge of
  [#69](https://github.com/utity-tools/squadio/pull/69)
- **PRs:** merged [#64](https://github.com/utity-tools/squadio/pull/64),
  [#65](https://github.com/utity-tools/squadio/pull/65),
  [#66](https://github.com/utity-tools/squadio/pull/66),
  [#67](https://github.com/utity-tools/squadio/pull/67),
  [#68](https://github.com/utity-tools/squadio/pull/68),
  [#69](https://github.com/utity-tools/squadio/pull/69)

## Done

- **[#64](https://github.com/utity-tools/squadio/pull/64): slice 3b.** The scenario page draws
  itself from the store. A registry in `scenarios/layout` keeps one store per scenario and rate
  access. The header has undo, redo and the save state, and totals count up with Motion. A live
  region speaks each step.
- **[#65](https://github.com/utity-tools/squadio/pull/65): slice 4, the bench.** A 12 rem left
  column from `xl` lists active people by category, with today's occupancy in Madrid and
  over-allocation. It filters by name and category. The seed adds two projects under way, each with
  a chosen scenario (205, 206) and no frozen rows yet. `loadScenario` takes the day.
- **[#66](https://github.com/utity-tools/squadio/pull/66): slice 5, keyboard parity.**
  - Enter on a node, row or cell opens its menu, with a "…" on nodes and a right click on rows.
  - "Add to team…" sits in the view bar and in the empty team.
  - `moveTargets` offers only the moves the change model accepts.
  - The focus manager (`stepFocus`) also restores focus after the first save's move to the copy,
    through a memory kept per store and the store's `renamed` map.
  - The live region says what a change did.
- **[#67](https://github.com/utity-tools/squadio/pull/67): `pnpm test:e2e:linux`.** The E2E tests
  run in the official Playwright image against a production build served from the host.
- **[#68](https://github.com/utity-tools/squadio/pull/68): the saving path end to end.**
  - The tests cover the copy, the cookie and the redirect, undo in the copy, a failed save with
    retry and axe, and back and forward.
  - They found a bug, now fixed: the first save's `renamed` left out rows the save removed, so
    undoing a remove was refused.
- **[#69](https://github.com/utity-tools/squadio/pull/69): slice 5b, the edit dialog.** "Edit…" is
  first in the menu. It changes the project role, who fills the role (a person of its category, or
  nobody), allocation, weekly hours (comma or point) and dates. `member-form.ts` turns the form
  into one edit.

## State

- Nothing open apart from this handoff. `main` is green.
- Every slice PR was reviewed by `reviewer`, `a11y-i18n-checker` and `domain-guardian`. Their
  blockers were fixed in the commits they belong to.

## Decisions

- **Slice 5 split** (owner): 5a for the menus and focus manager, then a test-only PR for the saving
  path.
- **Remove needs no confirmation:** undo brings it back.
- **Mobile stays read-only:** below `md` there are no menus and no "Add to team…".
- **A new plan row 5b, "Edit":** no slice had an edit dialog.
- **The edit dialog:**
  - "Edit…" is first in the menu.
  - A new person writes their weekly hours into the form, which can still be changed.
  - Hours are typed as text with a comma or a point.
  - Dates use the native date input.
- **Table cells are narrower:** side padding is 6 px, so the table fits at 1280 px next to the
  12 rem bench with Linux fonts. The owner chose this over a narrower bench.
- **The first save's `renamed`** is read right after the copy, before the changes (ADR 0011
  updated). The redirect replaces the template's history entry, so back leaves the scenario.
- **Amendments:** ADR 0008 gets one for the focus rule and for `moveTargets` as the drag's hit
  test (plan row 6). domain.md now has the project role's default, rule a for edits, and weekly
  hours above 0.

## Gotchas

- **CI runs Linux; a Mac pass proves little.** Run `pnpm test:e2e:linux` before pushing any change
  to pages or E2E tests. These differences cost CI runs:
  - Linux fonts are wider.
  - Enter on a `<select>` opens it on Linux instead of sending the form.
  - Radix moves menu focus a frame after each arrow, so assert focus after every key.
- **Playwright's "Desktop Chrome" reports Windows,** so press `Control+z`, not `ControlOrMeta+z`.
- **`crypto.randomUUID` needs a secure context.** The Linux script forwards the container's
  localhost to the host for that reason.
- **Radix DropdownMenu names its content after the trigger.** Pass `aria-labelledby={undefined}`
  with an `aria-label`.
- **Menus and dialogs portal into the team region** (`container`). Otherwise axe's `region` rule
  fails.
- **d3-zoom breaks `user.click` on the canvas in jsdom.** Use `fireEvent`.
- **`next start` runs `next-server` as a child.** Kill the process group, never a broad `pkill`;
  the auto-mode classifier blocks that.
- **Force-pushing is blocked for the agent.** For a behind PR use
  `gh pr update-branch <n> --rebase`. For changes to a pushed branch, add a commit.

## Next

1. **Slice 6, drag** (plan row 6, ADR 0008 point 1), on branch `feat/drag`. Plan it first:
   - one pointer-events layer from the bench to the canvas and inside the tree;
   - the drop hit test uses `moveTargets`;
   - mouse in E2E, touch in Chromium emulation.

   Start from `git switch -c feat/drag main`, then read `docs/research/simulator-poc`.

2. **Slice 7, choose scenario:** frozen tables in one transaction, and a backfill for the seed's
   chosen scenarios and visitor copies.
3. **Slice 8, the v0.2 release.**
4. **Open and not blocking:**
   - a touch path for the table's menu on tablets;
   - checking with VoiceOver that announcements after a dialog step are heard.
