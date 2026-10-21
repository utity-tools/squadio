# 0006: Preview template roles

- **Date:** 2026-10-21
- **Branch at close:** `ci/preview-deployments` (local only, not pushed) · `main` at `e154e3c`
- **PRs:** none open

## Done

- ADR 0009 (preview deployments with a Neon branch per pull request) committed as `a49ac1f` on
  `ci/preview-deployments`. It was out of date (it described the schema-only template); it was
  rewritten on the same branch before the pull request.
- The owner created a schema-only `preview-template` branch in Neon and ran the role query on it.

## State

- **Production is fine:** `squadio_owner` has `bypassrls = f` and is not a member of
  `neon_superuser`. The duplicate `neondb_owner` membership rows are expected (Postgres 16+ grants
  the creator ADMIN on the role it creates, plus the bootstrap's `GRANT ... SET TRUE`).
- **The schema-only `preview-template` is broken:** Neon recreated `squadio_owner` with `BYPASSRLS`
  and as a member of `neon_superuser`, which breaks [ADR 0004](../adr/0004-tenant-isolation-with-rls.md).
  The owner deleted it on 2026-10-21.
- **New `preview-template` (2026-10-21):** child of `production` with data and schema, auto-delete
  never. Branch protection is not offered on the free plan, so it is unprotected: never reset it
  from its parent. On it, both roles show `rolsuper`, `rolbypassrls`, `rolcreaterole` and
  `rolcreatedb` all false. The bootstrap membership check, run as
  `count(*)`, returned `0`: neither role reaches a superuser or `BYPASSRLS` role. Production holds no tables yet (only
  migration `0000_tenant_context`), so the template copies no data.
- **Password reset test (2026-10-21):** the owner reset `squadio_app`'s password from the console
  on `preview-template` and re-ran both checks: attributes all false, membership count `0`. A reset
  does not touch role attributes or memberships. The owner then reset `squadio_owner` and
  `neondb_owner` on the template too (2026-10-21) and re-ran both checks: attributes all false,
  membership count `0`. No template role shares a password with production any more.
- **Options that were on the table:**
  1. Template = a normal child of `production`, created now while production holds no tenant data
     (recommended). Roles match production and only new migrations run per preview. It must never
     be reset from its parent; protect it if the free plan allows.
  2. First try fixing the roles by hand on the schema-only branch (`ALTER ROLE ... NOBYPASSRLS`,
     revoke `neon_superuser`). Likely not permitted and fragile.

## Decisions

- **2026-10-21: the owner chose option 1** (template = a normal child of `production`).

- Whatever the template, `preview.yml` re-runs the bootstrap role check after resetting passwords:
  if `squadio_owner` or `squadio_app` can reach a superuser or `BYPASSRLS` role, the preview fails.
- ADR 0009 must be rewritten before the PR: the schema-only template moves to Alternatives with the
  concrete reason (Neon gave `squadio_owner` `BYPASSRLS`).
- When a plan depends on undocumented Neon or Vercel behaviour, propose the test before the plan.
  Tested from the console: a password reset leaves roles intact (the workflow re-checks it through
  the API anyway).
- **`vercel deploy --prebuilt --env` test (2026-10-21):** with Vercel CLI 64.0.2, a throwaway
  project (`squadio-env-probe`, deleted afterwards) built locally with `vercel build` and deployed
  with `vercel deploy --prebuilt --env KEY=VALUE`. A function read the variable at run time on both
  a `production` and a `preview` target; a variable not passed was absent. So `preview.yml` can
  hand each preview its own `DATABASE_URL` at deploy time. The variable is run time only:
  anything read at build time (such as `NEXT_PUBLIC_*`) still comes from the build environment.
  Preview deployments sit behind Vercel Authentication (anonymous requests get a `302`); the CLI
  reached them with `vercel curl`. Gotcha: the first deployment of a new project went to
  `production` even without `--prod`. The repo pins CLI 64.5.0; the first preview run confirms the
  same behaviour there.

## Gotchas

- The schema-only pivot was discussed in chat but never written to the repo, so the next session
  resumed from the stale ADR. Write state changes to a handoff as they happen.
- A canary failed in the first session that wrote this handoff; it was closed per `CLAUDE.md`.
- A second canary failed in the session that resumed it (2026-10-21): a short progress line before
  a tool call did not start with "Capitán". The Stop hook checks the first text of the turn, so
  every text block, even a one-line status, must start with it.

## Next

1. Done: the template's remaining passwords are reset and both role checks pass (see State).
2. Implement PR B on `ci/preview-deployments`, where ADR 0009 is already rewritten: pinned
   `neonctl`, `.github/workflows/preview.yml` (reset passwords, re-run the role check, migrate,
   build, deploy, alias; cleanup job on close), runbook (including "never reset
   `preview-template` from its parent"), and a `preview` GitHub environment with the Neon API key
   and the Vercel token. The `vercel deploy --prebuilt --env` question is settled (see State).
3. Still pending from handoff 0005: `sslmode=verify-full` on both production URLs (owner).
