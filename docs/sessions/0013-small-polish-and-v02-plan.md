# 0013: Small polish and the v0.2 plan

- **Date:** 2026-10-26
- **Branch at close:** `docs/handoff-0013` · `main` at `8c47aa5`, the merge of
  [#55](https://github.com/utity-tools/squadio/pull/55)
- **PRs:** merged [#55](https://github.com/utity-tools/squadio/pull/55)

## Done

- **[#55](https://github.com/utity-tools/squadio/pull/55): the small fixes from handoff 0012**, three
  commits:
  - `build(lint)`: ESLint ignores `.claude/worktrees/**`, with tests in `eslint.config.test.ts`. It
    goes first, so the next commit passes plain `pnpm lint` on its own.
  - `fix(theme)`: the theme switch is a Radix radio group, like the view switch. The arrow keys
    move to the next option and choose it. A unit test fails without the `onFocus` handler, and an
    E2E test checks the arrow keys in a real browser. `src/components/ui/toggle-group.tsx` is gone.
  - `fix(i18n)`: the empty team's text no longer names a view.
- **The v0.2 plan, approved by the owner** (below, under Next). Nothing is written yet.

## State

- No open PRs apart from this handoff. `main` is clean apart from the untracked
  `.claude/launch.json`.
- **The owner's, not blocking** (from handoff 0012): drop the stale tables in `neondb`, and keep one
  password manager entry per connection string.
- **Stale worktrees:** 15 under `.claude/worktrees`, from merged or abandoned branches. Removing
  them is the owner's call. Until then, `next dev` crashes in the main checkout (see Gotchas).

## Decisions

- **The demo survives edits through a copy per visitor** (owner, 2026-10-26, option B). An
  anonymous cookie gives each visitor their own copy of the demo organization. The seed keeps
  replacing only the template, and nobody sees another visitor's edits. The copy function is also
  the base of v0.5's organization templates. Rejected: a shared demo reset on every deploy and
  every night (A), and edits kept only in the browser (C). C drops optimistic locking and choosing
  a scenario from v0.2. **Needs ADR 0011** (amends ADR 0005's single access context and ADR 0006's
  reseeding).
- **The theme switch follows the view switch.** Focus chooses, because Radix only chooses while
  the arrow is held down. A theme is never unknown, so there is no null guard.

## Gotchas

- **`next dev` crashes in the main checkout** on a symlink loop in a stale worktree
  (`.claude/worktrees/jolly-bassi-31e0a5/node_modules/node_modules`). Tailwind's source scan reads
  `.gitignore` but not `.git/info/exclude`, where `.claude/worktrees/` is excluded. CI is
  unaffected. To run E2E here, use a clean checkout:
  `git worktree add --detach <scratch dir> HEAD`, then `pnpm install --frozen-lockfile
--prefer-offline`. Export CI's synthetic `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and
  `DATABASE_OWNER_URL` (from `.github/workflows/ci.yml`), run `pnpm db:migrate` and `pnpm db:seed`,
  then `pnpm test:e2e`. Adding `.claude/worktrees` to `.gitignore`, or a Tailwind
  `@source not`, would also fix it.
- **Commit order matters with `git rebase --exec`.** A fix that makes the checks pass must come
  before the commits that need it.
- **Rebase merges make new SHAs:** `git branch -d` warns after the merge. Compare trees
  (`git diff <old tip> main`) before deleting.

## Next

1. **Docs PR for v0.2**, branch `docs/plan-v02`
   (`git switch main && git pull --ff-only && git switch -c docs/plan-v02`). No code.
   - **`docs/plan.md`:** split v0.2 into the slices below, each with what done looks like.
   - **`docs/domain.md` and the glossary**, before any code:
     - the bench's "how busy": propose the sum of a person's allocation over the chosen scenarios
       that overlap today;
     - a change: add, move, remove or edit an assignment, and what is rejected (a cycle, the same
       person twice, impossible dates);
     - choosing a scenario writes the frozen tables (rule b);
     - the visitor's copy (a new glossary term).
   - **ADR 0011: saving edits and the visitor's copy.** It must settle:
     - **the cookie:** a random token that the server maps to the copy's organization id, never the
       id itself. HttpOnly, Secure, SameSite=Lax, and how long it lives;
     - **when the copy is made:** on the first edit, not the first visit, so bots and read-only
       visitors cost nothing. Until then the visitor reads the template;
     - **rendering:** reading a cookie makes the scenario pages dynamic under Cache Components.
       Measure the cost, or keep the template's pages static and go dynamic only with the cookie;
     - **the copy itself:** one transaction, new ids, composite foreign keys kept, under RLS. Which
       role creates the new organization, given that `withOrganization` scopes every query to one;
     - **clean-up:** a GitHub Actions cron that deletes copies idle for N days, and Neon's free
       storage limit;
     - **abuse:** a limit on new copies (per IP, or Vercel's firewall);
     - **access:** `currentAccessContext` reads the cookie. `?access=none` still only takes access
       away;
     - **amendments** to ADR 0005 (more than one access context before sign-in) and ADR 0006 (the
       seed replaces the template only).
   - Small decisions the PR proposes for the owner to review: editing does not need rate access
     (assignments hold no money); the seeded guide scenario stays as the reference.
2. **The build slices**, one PR each, tests first:
   1. **Change model:** pure, in `src/lib/scenarios`. It applies a list of changes and moves the
      undo and redo cursor. It is validated with Zod (ADR 0008, point 5) and has fast-check
      properties.
   2. **Saving and the visitor's copy:** a Server Action takes the base version and the changes,
      and returns the new version or a conflict. It includes the copy on first edit and DB tests
      for RLS, conflicts and the copy.
   3. **Store and header:** Zustand, ⌘Z and ⇧⌘Z, the save state indicator, and the summary
      recalculating with a Motion count. The live region starts speaking.
   4. **Bench:** the left panel, by category, with how busy each person is.
   5. **Keyboard parity:** "Add to team…", "Move to…" and "Remove" on nodes and table rows, plus the
      focus manager.
   6. **Drag:** the pointer-events layer from the bench to the canvas and inside the tree, with one
      shared drop-target hit test (ADR 0008).
   7. **Choose scenario:** rate access only, and it writes the frozen tables.
   8. **The v0.2 release:** handoff, README, tag.
3. **Optional follow-ups** (from handoff 0012): an explicit `organization_id` filter in `seedDemo`,
   and the open question of why `squadio_owner` reached `neondb` on 2026-10-20.
