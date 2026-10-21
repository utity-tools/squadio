# 0010: Canvas UI foundation

- **Date:** 2026-10-21
- **Branch at close:** `docs/handoff-0010` · `main` at `0125538`
- **PRs:** merged [#32](https://github.com/utity-tools/squadio/pull/32) (UI foundation, PR 1 of 6
  of the canvas)

## Done

- **Plan for the read-only canvas of v0.1, approved by the owner.** It is six PRs in sequence,
  tests first, with one PR ready to merge at a time:
  1. UI foundation
  2. open page data
  3. compact layout
  4. tree view
  5. table view
  6. summary rail with E2E
- **PR 1 is merged** ([#32](https://github.com/utity-tools/squadio/pull/32), five commits):
  - next-intl: `es` by default without a prefix, `en` under `/en`. The root layout is
    `app/[locale]` and reads the locale through `next/root-params`.
  - shadcn primitives: button, toggle group and skeleton.
  - Zinc tokens with a darker `muted-foreground` and `ring`, a `destructive-foreground` pair and the
    `status-ok/warn/bad` pairs. `src/app/theme-tokens.test.ts` checks every pair against WCAG in both
    themes.
  - One solid 2 px focus ring on every surface.
  - A system, light and dark switch, stored in a cookie and applied by an inline `<head>` script.
  - The route `/scenarios/[id]` with the grid of direction A, a loading skeleton, not-found, and a
    localized error with retry.
- **Brief update.** The brief has the "Missing price" state (rule l) and the locale decision.
- **ADR 0005 amendment.** Until v0.5 the app serves the demo organization with rate access. The
  context is built in one place, `currentAccessContext()` in `src/db/access.ts`.
- **CI.** The E2E job now migrates and seeds Postgres.

## State

- Nothing open. `main` holds all of PR 1.
- **Production:** the demo organization must be seeded by hand (`pnpm db:seed` against Neon) before
  `/scenarios/<id>` works there. Not done yet.
- The scenario page renders only the shell: a generic "Escenario" `<h1>`, an empty team and an empty
  summary. PRs 2 to 6 fill it.

## Decisions

- **The URL alone picks the locale.** There is no Accept-Language detection and no locale cookie
  (owner, 2026-10-21). README screenshots are in `en`.
- **The theme cookie is not read on the server.** That keeps pages prerendered. The switch renders
  "system" on the server and shows the stored preference once hydrated.
- **A missing scenario answers 200 with `noindex`, not 404.** `loading.tsx` streams before
  `notFound()` runs. This is accepted and documented in the brief's "Not found" row.
- **Possible ADRs.** The locale routing and the theme cookie are borderline ADR material and are
  recorded in the brief and the commits for now.

## Gotchas

- **`[locale]` sits at the root, so it also matches `/robots.txt`, `/api/x` and similar.**
  - An invalid locale falls back to `es`, so the layout renders.
  - Every page must call `assertLocale()` from `src/i18n/locale.ts` first.
  - `global-not-found` never fires with this layout.
- **A 404 under Cache Components is rendered on the client.**
  - Its HTML is an error shell, so inline `<head>` scripts never run there. `ThemeBootstrap` starts
    the theme instead.
  - `not-found.tsx` cannot set metadata. The page that calls `notFound()` sets the title.
- **shadcn's focus styles fail 3:1.**
  - The vendored primitives ship `outline-none` and a 50% `ring`. Remove both from every new shadcn
    component so the global outline applies.
  - `shadcn add` once installed an npm package called `cn` instead of using `@/lib/utils`. Check
    `package.json` after every `shadcn add`.
- **Prettier needs the tokens before the classes that use them.** `prettier-plugin-tailwindcss`
  sorts by `globals.css`, so a commit that uses token classes needs those tokens in the same commit,
  or `format:check` fails on it.
- **next-intl pulls in build scripts.** It brings `@parcel/watcher` and `@swc/core`, now set to
  `false` in `pnpm-workspace.yaml`.
- **Running the checks.**
  - E2E needs Postgres, `pnpm db:migrate` and `pnpm db:seed`, and `.env.test` exported
    (`set -a; . ./.env.test; set +a`).
  - `pnpm test:db` empties the demo organization, so seed again afterwards.
  - Delete `.next` when switching between commits: stale route types break `typecheck`.
  - axe runs with best practices through `tests/e2e/support/axe.ts`, which waits for colour
    transitions to finish first.
- **Base branches can be rewritten.** PR #31 was rewritten while this branch was stacked on it:
  `loadScenario` moved to `src/db/load-scenario.ts`. Check the base's SHA before rebasing.

## Next

1. **PR 2, open page data** (`feat/scenario-open-data`). Extend the open payload of `loadScenario`
   in `src/db` with:
   - project, client, scenario name and chosen;
   - pricing model;
   - assignments with role, person and category names;
   - project span and working days.

   Keep the pure parts in `src/lib/scenarios`, add DB tests, and fill the header of
   `/scenarios/[id]` (breadcrumb, name, Chosen badge, pricing model, span). First command:
   `git switch -c feat/scenario-open-data origin/main`.

2. **PR 3, compact layout.** A pure function in `src/lib/layout` (ADR 0008, spike in
   `docs/research/simulator-poc`) with fast-check properties: no overlapping nodes, and every parent
   above its children.
3. **PR 4, tree view.** React Flow nodes, dashed open roles, zoom controls, a roving-tabindex
   keyboard, and path highlighting.
4. **PR 5, table view.** An ARIA treegrid, the view in the URL, a shared selection, and the table as
   the default below `md`.
5. **PR 6, summary rail.**
   - The ledger, staff cost by category, warnings (rules k, l and j, budget cap) and the hours
     summary without rate access.
   - `?access=none` derived from `currentAccessContext()`.
   - Playwright and axe in both themes and both access states.
