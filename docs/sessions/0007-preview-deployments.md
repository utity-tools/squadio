# 0007: Preview deployments

- **Date:** 2026-10-21
- **Branch at close:** `docs/handoff-0007` · `main` at `1850971`
- **PRs:** merged [#17](https://github.com/utity-tools/squadio/pull/17) (preview deployments)

## Done

- Resumed [handoff 0006](0006-preview-template-roles.md). The owner reset the passwords of
  `squadio_owner` and `neondb_owner` on `preview-template`; both role checks passed (attributes all
  false, membership count `0`).
- Tested `vercel deploy --prebuilt --env` with a throwaway project (deleted afterwards): run-time
  variables reach a prebuilt deployment, on both targets.
- PR B merged as [#17](https://github.com/utity-tools/squadio/pull/17): ADR 0009, handoff 0006,
  `neonctl` 8.4.4, [`infra/neon/role-check.sql`](../../infra/neon/role-check.sql) (shared with the
  bootstrap, with a DB test), [`preview.yml`](../../.github/workflows/preview.yml) and the
  [preview runbook](../operations/preview.md).
- The owner set up the GitHub environment `preview`: variables `NEON_PROJECT_ID`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`; secrets `NEON_API_KEY` (scoped to the `squadio` project) and `VERCEL_TOKEN`
  (`squadio-github-previews`, expires 2027-10-21).
- #17's own preview ran green: branch, role check, migrations, deploy and alias. The log held no
  secret; `squadio-pr-17.vercel.app` answered `302` anonymously and `200` through `vercel curl`.
  After the merge the cleanup job ran green and the alias answers `404`.

## State

- No open work. `main` at `1850971`; `ci/preview-deployments` deleted locally and on GitHub.
- Not yet verified: that the app reaches Neon at run time from a preview (the home page reads no
  data), and that `preview/pr-17` is gone from the Neon console (the job reported success).

## Decisions

- **The preview build gets a synthetic `DATABASE_URL`.** `next.config.ts` only validates it, so the
  build runs before any secret exists and no credential can reach `.vercel/output`; the workflow
  still greps the output for the new passwords. Recorded in ADR 0009.
- **A fresh Neon branch on every push**, deleted and recreated from the template, so a pull request
  that rewrites one of its own migrations still migrates cleanly.
- **`neonctl` pinned to the newest release at least a week old** (8.4.4); Neon ships several a day.
- **Password resets go through the Neon API with `curl`**, the key on stdin; `neonctl` has no reset
  command, and `neonctl connection-string` would print a password.

## Gotchas

- GitHub runs `run:` steps with `bash -e`, without `pipefail`, unless a shell is named:
  `preview.yml` sets `defaults.run.shell: bash`; `deploy.yml` does not yet.
- `neonctl branches create` prints `neondb_owner`'s connection string unless `--no-secrets`.
- The first deployment of a new Vercel project goes to `production` even without `--prod`.
- Preview deployments sit behind Vercel Authentication; reach them with `vercel curl`.
- With rebase merge, `git branch -d` warns that the branch is not merged into `HEAD`: the commits
  land with new SHAs. Compare trees (`git diff <branch tip> main`) before deleting.

## Next

1. **Owner:** confirm in the Neon console that `preview/pr-17` is gone and only `production` and
   `preview-template` remain.
2. `ci: run deploy steps with pipefail`: add `defaults.run.shell: bash` to `deploy.yml`. Branch
   `ci/deploy-pipefail`.
3. **Owner:** still pending from handoff 0005: `sslmode=verify-full` in `DATABASE_OWNER_URL`
   (GitHub `production`) and `DATABASE_URL` (Vercel Production), then a manual deploy.
4. Still open from handoff 0004: euros or cents in `numeric`, whether a chosen scenario freezes
   overhead % and buffer %, and an ESLint rule against `process.env` outside `src/env*.ts`.
5. v0.2 (scenarios): plan the first slice from [`docs/plan.md`](../plan.md) (v0.2 build notes) and
   [ADR 0008](../adr/0008-simulator-interaction-stack.md). Its first page that reads data also
   verifies a preview reaching Neon at run time.
