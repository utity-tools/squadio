# 0009. Preview deployments with a Neon branch per pull request

- **Status:** accepted
- **Date:** 2026-10-21

## Context

[ADR 0006](0006-deploys-from-github-actions.md) turned Vercel's Git integration off, so pull
requests get no preview, and left previews to a workflow of their own with a Neon branch per pull
request. Four constraints shape it:

- **Data:** test data is always synthetic. A normal Neon branch copies its parent's data, so a
  branch of production would copy every tenant once v0.5 has real ones.
- **Credentials:** a child branch duplicates its parent's roles. If their passwords were
  production's too, a leaked preview connection string would also open production.
- **Roles:** Neon's integration with Vercel connects as `neondb_owner`, a member of
  `neon_superuser`, which has `BYPASSRLS` ([ADR 0004](0004-tenant-isolation-with-rls.md)). The app
  must connect as `squadio_app` in previews too, and neither `squadio_owner` nor `squadio_app` may
  reach a role that bypasses RLS.
- **Free plan:** 10 branches per project, of which 3 can be root branches (`production` is one),
  computes that scale to zero after 5 minutes, and no branch protection.

## Decision

A `preview.yml` workflow gives each pull request a Vercel preview backed by its own Neon branch,
created from a template branch that holds production's roles and schema but no data, and deleted
when the pull request closes.

- **The template, `preview-template`, is a normal child of `production`,** created once on
  2026-10-21, while production held no tables. It keeps production's roles exactly, which the
  bootstrap's role check confirmed on it, and its migrations journal, so previews only run the
  migrations added since. Its role passwords are reset once, so they do not match production's.
  It is never reset from its parent: that would copy production's data, and the free plan cannot
  protect it.
- **Each pull request gets a normal child of the template, `preview/pr-<number>`,** so it starts
  with no data and counts against the 10 branches, not the 3 roots. It expires after 14 days as a
  safety net.
- **Passwords are reset on every preview branch** through the Neon API, which scopes the reset to
  that branch. The workflow masks them in the log, and they never match production's or another
  preview's. A reset leaves role attributes and memberships intact, which was tested on the
  template.
- **The workflow re-runs the bootstrap's role check** on every preview branch after the reset: if
  `squadio_owner` or `squadio_app` can reach a superuser or `BYPASSRLS` role, the preview fails
  before anything is deployed.
- **The workflow builds, migrates and deploys like `deploy.yml`:** `vercel pull` and `vercel build`
  for the Preview environment, migrations as `squadio_owner`, then `vercel deploy --prebuilt`.
  `DATABASE_URL` (as `squadio_app`, through the pooler) reaches the deployment from the workflow
  as a run-time variable, never from a Vercel variable, because branch-scoped Vercel variables need
  the Git integration. The build runs before the branch exists, with a synthetic `DATABASE_URL`
  that `next.config.ts` only validates, so no preview credential can reach the build output; the
  workflow still searches the output for the new passwords before deploying.
- **Each preview keeps a stable URL**, `squadio-pr-<number>.vercel.app`, through `vercel alias set`.
  That URL is the build's `NEXT_PUBLIC_APP_URL`. Vercel's standard deployment protection keeps it
  behind a Vercel login.
- **`neonctl` is a pinned dev dependency**, like the Vercel CLI, so CI and local runs use the same
  version and Dependabot updates it. No third-party actions.
- **Only `pull_request` events from this repository** run the workflow, never
  `pull_request_target`. Pull requests from forks and from Dependabot get no secrets, so they skip
  the preview. The secrets live in a GitHub environment named `preview`: a Neon API key scoped to
  the project, and the Vercel token.
- **Closing a pull request deletes its Neon branch and alias**, in a job of its own that a push
  never cancels; only reopening the pull request can, and the new preview then deletes and
  recreates the branch anyway. A newer push to the same pull request cancels an older preview run,
  since its branch is disposable.

## Alternatives considered

- **A schema-only template branch:** it would hold no data by construction, but Neon's schema-only
  branching (beta) recreated `squadio_owner` with `BYPASSRLS` and as a member of `neon_superuser`,
  which breaks ADR 0004. Fixing the roles by hand on it would depend on Neon allowing it and on
  every future template being fixed the same way.
- **Preview branches as direct children of `production`:** no template to keep, but they copy
  production data once there is any.
- **Neon's integration with Vercel:** it creates the branches for us, but the app would connect as
  `neondb_owner` and bypass RLS.
- **One shared preview branch:** fewer branches, but pull requests would migrate the same database
  and break each other.
- **Neon's GitHub Actions:** convenient, but third-party code holding the API key, where a pinned
  CLI does the same.

## Consequences

- Every pull request from this repository has a working preview against its own schema, without
  production data or credentials.
- The template never needs updating: new migrations reach each preview from the pull request. Each
  preview replays every migration added since 2026-10-21, which grows slowly with the project.
- Resetting the template from `production` would leak tenant data into every later preview. Nothing
  enforces this but the runbook. If the template ever has to be rebuilt once production holds data,
  that needs a new decision.
- Runtime variables passed with `vercel deploy --env` reach a prebuilt deployment (tested on
  2026-10-21 with a throwaway project, see handoff 0006). They are run time only: build-time values
  come from the build environment.
- At most 8 previews can exist at once, beside `production` and the template. Branches that outlive
  their pull request expire.
- The Vercel token is scoped to the whole team, not to previews: Hobby has no narrower token. A
  workflow in a pull request could use it for production, which only matters because the owner is
  the only one who can push.
- Every preview has its own compute, which scales to zero and counts against the monthly compute
  hours.

## Amendments

- **2026-10-26:** Previews start with the demo organization. A preview without data could not open
  a scenario, so it could not be checked before a merge. After the migrations, the workflow runs
  `pnpm db:seed` as `squadio_app`, the same seed the owner runs by hand in production. The demo
  data is synthetic, so the data constraint holds: the branch still copies nothing from production.
  The template stays empty.
