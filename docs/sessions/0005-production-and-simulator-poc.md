# 0005: Production deploy (step 9, PR A) and the simulator proof of concept

- **Date:** 2026-10-15 to 2026-10-20
- **Branch at close:** `docs/session-0005-production` · `main` at `7c13147`
- **PRs:** [#11](https://github.com/utity-tools/squadio/pull/11) merged; the PR for this branch is
  open (runbook fixes, `vercel.json` framework, this handoff). Dependabot
  [#12](https://github.com/utity-tools/squadio/pull/12) and
  [#13](https://github.com/utity-tools/squadio/pull/13) are open and unreviewed.

## Done

- Step 9, PR A ([#11](https://github.com/utity-tools/squadio/pull/11)): `infra/neon/bootstrap.sql`,
  `deploy.yml` (gate, then pull → build → migrate → `deploy --prebuilt --prod`), `vercel.json`
  (`fra1`, Git deploys off), [ADR 0006](../adr/0006-deploys-from-github-actions.md),
  [ADR 0007](../adr/0007-postgres-18.md) (Postgres 18 locally and in CI) and the
  [runbook](../operations/deploy.md).
- The one-time setup in the runbook, done by the owner on 2026-10-20:
  - Neon project `squadio`, Postgres 18, AWS Frankfurt. Bootstrap ran clean; the `public` schema
    grants were checked in the SQL Editor (`squadio_app=U`, `C` only for the owner).
  - Vercel project `squadio` in `utity-tools-projects`, framework preset Next.js, Node 24.x.
    `DATABASE_URL` and `NEXT_PUBLIC_APP_URL` in Production, both of type Config.
  - GitHub environment `production`, limited to `main`: variables `VERCEL_ORG_ID`,
    `VERCEL_PROJECT_ID`; secrets `VERCEL_TOKEN`, `DATABASE_OWNER_URL`.
  - `squadio.utitytools.com`: Cloudflare `CNAME` (DNS only) to the project's Vercel target.
- **Production is live.** The first deploy
  ([run 39442924322](https://github.com/utity-tools/squadio/actions/runs/39442924322)) applied the
  migrations on Neon and promoted the build; `https://squadio.utitytools.com` returns 200 with a
  Let's Encrypt certificate.
- Simulator proof of concept, 2026-10-15, in `~/poc-squadio` (local only, no remote, never merged).
  Its `FINDINGS.md` has the measurements; the verdict is below under Decisions.
- This branch: `vercel.json` pins `"framework": "nextjs"`, and the runbook is corrected from what
  the real setup showed.

## State

- `main` is clean at `7c13147`. This branch holds two commits plus this handoff, in an open PR.
- The deploy run triggered by merging #11 failed at `vercel pull` (no token yet). It stopped
  before the build and touched nothing; the manual run afterwards succeeded.
- The owner's `.env.local` gained a `VERCEL_OIDC_TOKEN` from `vercel link`.
- The two production connection strings still end in `sslmode=require`; the runbook now says
  `verify-full` (see Next).

## Decisions

- **Simulator PoC verdict: the stack holds.** Keep React Flow, Zustand and Motion; Next 16, React
  19 with the Compiler, Tailwind v4 and shadcn/ui showed no issues. 150 bench cards and 30 tree
  nodes stay at 55–60 fps under 4× CPU throttling; axe reports 0 violations in both themes. Two
  changes for v0.2, **which need an ADR** (see Next):
  - **Drag with pointer events**, not HTML5 drag-and-drop, which fails on touch and has no keyboard
    story. One path for mouse, touch and pen; no dnd-kit.
  - **A custom compact tree layout** in `src/lib/layout`, not dagre or elkjs. A PM with 20–25
    direct reports is normal, and every tidy-tree library lays them side by side; the compact
    layout stacks leaf children like an org chart. elkjs alone would add 600 KB gzip.
  - Also from the PoC: a focus manager and the accessible tree or table view belong in v0.2, not
    in a polish step; invalid scenario changes are rejected at dispatch time, before they take an
    undo slot; Motion drives re-layout tweens as a value animator, since React Flow owns each
    node's `transform`.
- `vercel.json` pins the framework so production does not depend on a dashboard setting.
- Connection strings will use `sslmode=verify-full`, the behaviour `pg` already gives `require`
  today, once the owner updates them (Next 1). Production still says `require`.

## Gotchas

- **`psql` prints arguments it cannot use, password included.** `psql "$URL" -d squadio` made the
  URL a role name, and a variable holding only the password became a database name; both errors
  printed the `neondb_owner` password into the chat, and it was reset twice. Check variables
  before use and verify in Neon's SQL Editor (now in the runbook).
- `psql` opens its pager on long output; `-P pager=off` avoids it.
- Neon's Connect dialog shows a placeholder password for roles created with SQL: compose their
  connection strings in the password manager.
- `vercel project add` creates the project with the "Other" preset, which builds a static site.
- `vercel env add` offers **Secret** first for credential-like names; **Config** is the one that
  works with `vercel pull` (ADR 0006).
- The Cloudflare `CNAME` target is project-specific (`<hash>.vercel-dns-017.com`): read it with
  `vercel domains verify`.
- The Vercel CLI session token on the owner's Mac expired on 2026-10-20; `vercel login` renews it.
  The GitHub Actions token `squadio-github-actions` expires on 2027-10-20.
- The canary Stop hook checks the first text of every turn, progress notes included.

## Next

1. **Owner:** change `sslmode=require` to `sslmode=verify-full` in `DATABASE_OWNER_URL` (GitHub
   environment `production`) and `DATABASE_URL` (Vercel Production), then run the deploy by hand
   (`gh workflow run deploy.yml -R utity-tools/squadio --ref main`) to check both.
2. ADR 0008 for the PoC findings (pointer-events drag, compact layout, Motion as a tween driver)
   and the matching notes in `docs/plan.md` v0.2. Branch `docs/simulator-poc-adr`; start from
   `~/poc-squadio/FINDINGS.md`.
3. Step 9, PR B: per-PR Neon branches from a GitHub workflow, with a branch-scoped Preview
   `DATABASE_URL` (not the Neon↔Vercel integration, which uses `neondb_owner`).
4. Review Dependabot [#12](https://github.com/utity-tools/squadio/pull/12) and
   [#13](https://github.com/utity-tools/squadio/pull/13).
5. Still open from handoff 0004: euros or cents in `numeric`, whether a chosen scenario freezes
   overhead % and buffer %, and an ESLint rule against `process.env` outside `src/env*.ts`.
6. Left from the #11 review: verify after each deploy that production serves the new deployment.
