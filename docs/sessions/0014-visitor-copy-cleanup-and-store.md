# 0014: Visitor copy clean-up and the scenario store

- **Date:** 2026-10-28
- **Branch at close:** `docs/handoff-0014` · `main` at `ee16f5a`, the merge of
  [#61](https://github.com/utity-tools/squadio/pull/61)
- **PRs:** merged [#60](https://github.com/utity-tools/squadio/pull/60),
  [#61](https://github.com/utity-tools/squadio/pull/61); open
  [#62](https://github.com/utity-tools/squadio/pull/62)

## Done

- **Firewall rule** "First saves per IP" published in Vercel by the owner (runbook
  `docs/operations/deploy.md`, step 7): POST + `Next-Action` header + no `squadio_visitor` cookie,
  fixed window 600 s, 10 requests, per IP, deny. Hobby accepted the 600 s window.
- **[#61](https://github.com/utity-tools/squadio/pull/61): slice 2c, clean-up of idle visitor
  copies.** Migration 0005 makes `app.claim_visitor_copy` answer `gone` when its touch finds the
  claim deleted; the save touches the claim before any tenant row (same lock order as the
  clean-up). `cleanUpVisitorCopies` deletes copies idle for 30 days, one transaction per copy, with
  a `FOR UPDATE` recheck and a 10 s lock timeout; `pnpm db:clean-up`; `clean-up.yml` daily at 04:17
  UTC. Run once by hand after the merge: green, "Deleted 0". Slice 2 is complete.
- **[#62](https://github.com/utity-tools/squadio/pull/62): slice 3a, the scenario store and its
  automatic save** (6 commits, nothing on screen yet). `scenarioView(basis, team)` shared by the
  loader and the page; a Zustand store with dispatch/undo/redo, Zod on dispatch, chosen scenarios
  refused; autosave per ADR 0011 with statuses saved, waiting, saving, failed, conflict, limit,
  gone, refused; ids renamed to the copy's on the first save.

## State

- #62 open, CI starting. Reviewed by `reviewer` and `domain-guardian`: no blockers, suggestions
  applied. Every commit checked on its own with `git rebase main -x '<checks>'`.
- This handoff is its own PR; merge #62 first, then rebase this one if it is behind.

## Decisions

- **Slice 3 is split in two PRs** (owner, 2026-10-28): 3a store and save, 3b what is seen.
- **The history survives the first save** (owner): the store lives above the page and renames
  every id it holds with `renamed`. 3b must put the store provider in a layout above
  `scenarios/[id]`, so the redirect to the copy does not unmount it, and adopt the copy page's fresh
  basis when it arrives.
- **Money in the browser** (owner): with rate access the page gets the engine's inputs for every
  category, never stored salaries; without it, none. ADR 0005 amendment of 2026-10-28.
- **No edit control in slice 3** (owner): it is tested with unit and component tests; the E2E of
  edit, see the margin change and undo comes with slice 5. Undo and redo show disabled until then.
- **Motion is added with the count-up in 3b**, not before; Zustand is pinned to a release at least
  two weeks old, and new dependencies follow the same rule.

## Gotchas

- Lock tests wait for Postgres to report a blocked session (`waitForLockWaiter` in
  `tests/db/support.ts`), never on a sleep.
- Splitting one working tree into a fixup and a new commit that touch the same file: back up the
  full file, strip the second change, commit the fixup, restore, commit the rest. A fixup whose
  context differs from its target commit's file conflicts on autosquash.
- `git commit --fixup=amend:<sha>` rewords a commit with `GIT_EDITOR="cp <file>"`; the file starts
  with `amend! <old subject>`, a blank line, then the new message.
- The canary failed twice in this session on progress messages that ended a turn: the reply that
  ends a turn starts with "Capitán", even a one-line status.

## Next

1. After #62 merges: slice 3b on `feat/scenario-views`. The views read the store (provider in a
   layout above `scenarios/[id]`), header with undo/redo and ⌘Z / ⇧⌘Z (Ctrl elsewhere, not inside
   inputs) and the save state, `motion` added for the count-up (reduced motion: instant), live region
   for summary changes and refused steps. Give the store `dispose()` for pending timers and decide
   whether to flush on `pagehide`. Check the Server Action's result type is assignable to the
   store's `SaveOutcome`.
2. Then slice 4, the bench.
