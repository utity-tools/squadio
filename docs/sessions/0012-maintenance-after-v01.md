# 0012: Maintenance after v0.1

- **Date:** 2026-10-26
- **Branch at close:** `docs/handoff-0012` · `main` at `33d3b1b`, the merge of
  [#53](https://github.com/utity-tools/squadio/pull/53)
- **PRs:** merged [#40](https://github.com/utity-tools/squadio/pull/40),
  [#41](https://github.com/utity-tools/squadio/pull/41),
  [#51](https://github.com/utity-tools/squadio/pull/51) (replaced
  [#39](https://github.com/utity-tools/squadio/pull/39)),
  [#52](https://github.com/utity-tools/squadio/pull/52) and
  [#53](https://github.com/utity-tools/squadio/pull/53)

## Done

- **Dependabot**, one at a time, changelogs reviewed:
  - [#51](https://github.com/utity-tools/squadio/pull/51): Next 16.4.3, neonctl 8.11.1,
    lucide-react, commitlint. neonctl 8.11 keeps the flags and the "Branch … not found" message
    that `preview.yml` relies on.
  - [#40](https://github.com/utity-tools/squadio/pull/40): the Vercel CLI 64.5 → 65.2. No release
    notes exist; the `--help` of both versions showed every flag the workflows use unchanged
    (`--target` became `--environment` and `deploy -e` now means `--environment`: we use neither).
    Proven by the production deploy that followed.
  - [#41](https://github.com/utity-tools/squadio/pull/41): codeql-action 4.39.1, SHA checked
    against the tag.
- **Production seeds on every deploy** ([#52](https://github.com/utity-tools/squadio/pull/52)):
  after the migrations, as `squadio_app`, with the `DATABASE_URL` that `vercel pull` wrote. ADR
  0006 and 0009 have amendments.
- **The post-mortem's follow-ups** ([#53](https://github.com/utity-tools/squadio/pull/53)):
  - `pnpm db:check-target <owner|app>` fails unless a URL leads to production's database and role.
    The deploy runs it before the migrations and before the seed.
  - a smoke test after the deploy opens the guide scenario and needs a 200 and "Plan A";
  - the runbook covers Connect's database selector, checking a string and "Change to Secret".
- The first deploy with all of it ([40381661564](https://github.com/utity-tools/squadio/actions/runs/40381661564))
  is green: both targets checked, seeded, smoke test passed.

## State

- No open PRs. `main` is clean apart from the untracked `.claude/launch.json`.
- **The owner's, not blocking:**
  - drop the stale tables in `neondb` (SQL below);
  - one password manager entry per connection string, named after its variable.

### Dropping the stale tables in `neondb`

`squadio_owner` can no longer connect to `neondb` (the bootstrap revokes `CONNECT` from `PUBLIC`),
so run it in Neon's **SQL Editor** with the database selector on `neondb`. The bootstrap lets
`neondb_owner` act as `squadio_owner`, which owns everything here. Check first:

```sql
SELECT current_database() AS db, schemaname, tablename, tableowner
  FROM pg_tables
 WHERE schemaname IN ('public', 'drizzle', 'app')
 ORDER BY 2, 3;
```

Expect `neondb` and 11 rows. Then, in one transaction that stops on any other database:

```sql
BEGIN;
SET LOCAL ROLE squadio_owner;
DO $$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'connected to %, not neondb: nothing dropped', current_database();
  END IF;
END
$$;
DROP TABLE IF EXISTS
  public.assignments, public.category_rates, public.extra_costs, public.project_pricing,
  public.scenarios, public.people, public.projects, public.categories, public.cost_config,
  public.config;
DROP TYPE IF EXISTS public.extra_cost_base, public.extra_cost_kind, public.pricing_model;
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS app CASCADE;
COMMIT;
```

The first query must then return no rows. Tick the follow-up in the post-mortem afterwards. The
same statements, run with `psql` against a local copy of the mistake, left it empty and refused
`squadio_test`.

## Decisions

- **Check the target before writing, not after.** The post-mortem said "after migrating"; before
  means a wrong string writes nothing. The app's string is checked after the migrations and before
  the seed, as approved: the owner's, which is the one that migrates, is checked first.
- **The smoke test checks content, not only the status.** A scenario that is not found also answers
  200 in production, because the page streams. A unit test keeps the id and name that `deploy.yml`
  repeats in step with the seed.
- **`DATABASE_URL` comes from the file `vercel pull` writes**, so Vercel stays its only source. It
  is parsed with `util.parseEnv`: `@next/env` expands `$`.
- **The seed replaces the demo on every deploy.** Right while scenarios are read-only; v0.2 must
  revisit it before people can edit (ADR 0006, amendment of 2026-10-26).

## Gotchas

- **`@dependabot rebase` can replace a grouped PR.** When newer versions exist it closes the PR and
  opens a new one with the whole group (#39 became #51). Review the new one from scratch.
- **Dependabot PRs skip the preview**, so a CLI they bump (Vercel, neonctl) is first exercised by
  the next preview or the production deploy. Compare `--help` across versions before merging.
- **A streaming page answers 200 for `notFound()`.** Any check of a page, smoke test or E2E, must
  look at its content.
- **`@next/env` expands `$` in values.** Use `util.parseEnv` to read a dotenv file as written.
- **The Vercel plugin's validator flags `require()` in `.github/workflows/*.yml`** as if they were
  Workflow DevKit files. It is a false positive for `node --eval` in a runner step.
- **Shell blocks for the owner:** each Run button or tab is a new shell, so a variable set with
  `read -rs` does not reach the next block. Give one-line commands that check the variable before
  using it. In zsh, `status` is read-only: test loops with `bash -c`.
- **pnpm 11 has no `-s`.** Use `pnpm <script>` and filter the output.

## Next

1. **Small fixes**, one PR, three commits, branch `fix/small-polish`
   (`git switch main && git pull --ff-only && git switch -c fix/small-polish`):
   - **The theme switch's arrow keys.** `src/components/theme/theme-switch.tsx` is a Radix
     `ToggleGroup` whose comment promises "one tab stop moved with the arrow keys". Likely gap: the
     arrows move focus without choosing, while a radio group's arrows also select. Start with a
     failing test in `theme-switch.test.tsx` that presses an arrow and expects the preference to
     change, and check the roles axe expects.
   - **ESLint ignores `.claude/worktrees/**`** in `globalIgnores` (`eslint.config.mjs`), so plain
     `pnpm lint` works with stale worktrees; `eslint.config.test.ts` covers the config.
   - **The empty state's text.** `TeamTree.empty.description` says "como un árbol" / "as a
     tree", but the table view shows it too: make it view-neutral in `messages/es.json` and
     `messages/en.json`.
2. **Plan v0.2** (editing scenarios): the bench, the change model with optimistic locking and undo,
   drag and drop with keyboard parity, and choosing a scenario. Start from
   [docs/plan.md](../plan.md#v02-build-notes) and the brief's "What changes in v0.2". The plan must
   decide how the demo survives edits now that every deploy reseeds it (ADR 0006), in an ADR.
3. **Optional follow-ups:**
   - `seedDemo` deletes without a `WHERE` and relies on Row Level Security; an explicit
     `organization_id` filter is defence in depth.
   - An open question for the post-mortem: migrations reached `neondb` on 2026-10-20, yet
     `squadio_owner` may not connect to it today. Find out whether the grant changed.
