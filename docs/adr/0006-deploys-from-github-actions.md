# 0006. Deploys from GitHub Actions, with SQL-created Neon roles

- **Status:** accepted
- **Date:** 2026-10-15

## Context

[ADR 0001](0001-stack-and-workflow.md) puts production on Vercel and Neon and says migrations reach
Neon only through GitHub Actions, and production deploys only after its migrations succeed.
[ADR 0004](0004-tenant-isolation-with-rls.md) needs two roles, `squadio_owner` and `squadio_app`,
neither of which may bypass Row Level Security. Two platform defaults work against this:

- Vercel's Git integration builds and promotes every push to `main` on its own, before or without
  any migration, and whether or not CI passed.
- Neon makes every role created in its console or API, including the default `neondb_owner`, a
  member of `neon_superuser`, which has `BYPASSRLS`.

## Decision

GitHub Actions is the only way into production, and the Neon roles are created with SQL.

- **Vercel Git deployments are off** (`git.deploymentEnabled: false` in `vercel.json`) and the
  project is not connected to the repository. Region `fra1`, next to Neon in AWS Frankfurt.
- **`deploy.yml` runs after CI passes on `main`**, through `workflow_run`, on the exact commit CI
  tested. A first job, without secrets, skips the deploy unless that commit is still the tip of
  `main` (so a slow CI run never ships older code) and, for a manual run, fails unless CI passed on
  it. Then, in the GitHub environment `production` (restricted to `main`): `vercel pull` and
  `vercel build --prod`, migrations as `squadio_owner`, and `vercel deploy --prebuilt --prod`.
  Building before migrating means a failed build leaves the database untouched. One deploy at a
  time, never cancelled midway.
- **The Vercel CLI is a pinned dev dependency**, so CI and local runs use the same version and
  Dependabot updates it.
- **Neon roles come from [`infra/neon/bootstrap.sql`](../../infra/neon/bootstrap.sql)**, run once
  as `neondb_owner`. It creates both roles with no memberships and the `squadio` database owned by
  `squadio_owner`, mirrors the local Docker init script, and fails if either role can reach a
  superuser or `BYPASSRLS` role. `neondb_owner` is granted `SET` on `squadio_owner` (to create the
  database it owns), never the other way round.
- **The app connects through Neon's pooler, migrations directly.** The pooler's transaction mode is
  safe because the tenant context is set per transaction.
- **`DATABASE_URL` is an encrypted Vercel variable, not a sensitive one.** `next build` validates
  the server environment, and Vercel never returns sensitive values to `vercel pull`. The value is
  the app role's, which RLS binds, and only project members can read it.
- **Migrations are backwards compatible** (expand, then contract), because the previous deployment
  serves traffic while they run and a rollback reverts the app only.

The steps and the rollback live in [`docs/operations/deploy.md`](../operations/deploy.md).

## Alternatives considered

- **Vercel's Git integration with a migration in the build command:** the build would hold the owner
  credentials, run on every preview, and deploy commits whose CI failed.
- **Roles from the Neon console:** simpler, but they inherit `BYPASSRLS` and break ADR 0004.
- **A `push` trigger with CI as a reusable workflow:** runs the checks twice on every merge;
  `workflow_run` reuses the CI result.
- **`vercel.ts` instead of `vercel.json`:** two settings do not justify another dependency.
- **A sensitive `DATABASE_URL`, validated only at runtime:** the build would stop catching a missing
  or malformed value, and any page prerendered with data would still need it at build time.

## Consequences

- A merge reaches production a few minutes after CI, with no Vercel dashboard step.
- Preview deployments need their own workflow, with a Neon branch per pull request (next PR).
- Destructive schema changes take two deploys.
- After a `vercel rollback`, new deployments are not promoted until one is promoted by hand.
- `VERCEL_TOKEN` is a long-lived secret: it is scoped to the team, has an expiry, and is rotated as
  the runbook describes.
- The `neondb_owner` connection string is only used by hand, for the bootstrap and for password
  rotation. It never reaches CI or Vercel.

## Amendments

- **2026-10-26:** Production seeds the demo organization on every deploy, after the migrations, as
  previews do ([ADR 0009](0009-preview-deployments.md)). Seeding by hand after each seed change was
  easy to forget. The seed runs as `squadio_app` with the `DATABASE_URL` that `vercel pull` wrote,
  so Vercel stays its only source. It replaces the demo organization's data, which is right while
  scenarios are read-only: once v0.2 lets people edit them, every deploy would discard their edits,
  so this must be revisited then.
