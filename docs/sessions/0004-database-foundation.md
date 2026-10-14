# 0004: Database foundation with forced RLS (step 8) and rate access

- **Date:** 2026-10-14
- **Branch at close:** `docs/rate-access-adr` · `main` at `4e96bd7`
- **PRs:** [#9](https://github.com/utity-tools/squadio/pull/9) merged; the PR for this branch is
  open (ADR 0005 and this handoff)

## Done

- Step 8 ([#9](https://github.com/utity-tools/squadio/pull/9), 12 commits):
  - Postgres 17 in Docker (`docker-compose.yml`, port 5434), shared with CI.
  - Two roles, neither a superuser: `squadio_owner` for migrations, `squadio_app` for the app.
    Two databases: `squadio` for development, `squadio_test` for tests and CI.
  - Drizzle 0.45 and the first migration, `0000_tenant_context` (schema `app`,
    `app.current_organization_id()`, least-privilege defaults).
  - `withOrganization(db, organizationId, fn)` in `src/db/tenant.ts`.
  - Database tests in `tests/db` (`pnpm test:db`), including a catalog guard test.
  - A CI `database` job, and database tests in the per-commit loop on a fresh database.
- [ADR 0004](../adr/0004-tenant-isolation-with-rls.md) (tenant isolation with forced RLS) and the
  [review record](../reviews/0001-database-foundation.md): 16 findings fixed on the branch.
- `.env.test` is versioned with synthetic values; AGENTS.md, `guard-bash` and the settings allow it.
- `guard-bash` now also blocks `.env` reads after `<`, `(` or a backtick (applied by the owner).
- "Migrations and database tests" is a required check in the `main` ruleset.
- [ADR 0005](../adr/0005-rate-access-in-the-database.md): rate access enforced by the database.
  `docs/domain.md` splits money into restricted entities; reviewed by `domain-guardian`, whose
  findings (write paths, derived money, health checks, templates, glossary) are folded in.

## State

- `main` is clean. The `docs/rate-access-adr` branch holds ADR 0005, the domain changes, the review
  record update and this handoff, in an open PR.
- The owner's `.env.local` has `DATABASE_URL` and `DATABASE_OWNER_URL`; the local `squadio`
  database is migrated.

## Decisions

- `organization_id` is `uuid`, checked against Better Auth 1.7.7 (`advanced.database.generateId:
"uuid"`) by reading the package, not the docs (ADR 0004).
- The owner role is not a superuser anywhere, so local runs and CI match Neon (ADR 0004).
- `.env.test` is versioned: Next.js skips `.env.local` in test mode, and the rule exists to protect
  secrets, not file names. Synthetic values only.
- Rate access is enforced by the database, with money in restricted tables (ADR 0005), for the same
  reason as tenancy: a forgotten condition returns nothing instead of salaries.
- Still open (review record, C to E): Better Auth's tables, global reference data, and whether
  `numeric` holds euros or cents.

## Gotchas

- **Correction to handoff 0003:** `guard-bash` does not block `.env.example` (nor now `.env.test`).
  It blocks any other `.env` path anywhere in a command's text, heredocs and commit messages
  included: write such files and long commit messages with the Write tool and `git commit -F`.
- Never rephrase or split a command to get past a hook or the permission classifier: stop and tell
  the owner. The classifier stops agents from editing `.claude/hooks` and `.claude/settings.json`;
  the owner applies those changes.
- `pnpm add` of a package with build scripts (esbuild via drizzle-kit) writes a placeholder into
  `pnpm-workspace.yaml` `allowBuilds`; deciding it is the owner's call. esbuild stays `false`.
- Next's `loadEnvConfig` skips `.env.local` when `NODE_ENV=test`, which Vitest sets.
- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA` cannot revoke the global default `EXECUTE` for `PUBLIC`
  on functions; the revoke must be global.
- The Postgres image's `POSTGRES_USER` is always a superuser: bootstrap with `postgres` and create
  the owner role in the init script.
- Recreating the local database (`docker compose down --volumes`) wipes the development database;
  run `pnpm db:migrate` afterwards.

## Next

1. Merge the ADR 0005 PR.
2. Step 9: Vercel, Neon and DNS. Create `squadio_app` on Neon with SQL, not the console, and verify
   it is no member of a role with `BYPASSRLS` (ADR 0004). Set `NEXT_PUBLIC_APP_URL` and
   `DATABASE_URL` for Preview too. Migrations reach Neon only through GitHub Actions.
3. Before the first money column: decide euros or cents in `numeric` and the Drizzle mapping
   (review decision E).
4. Open domain question: a chosen scenario freezes category rates (rule b), but overhead % and
   buffer % still follow CostConfig. Decide whether they freeze too, in `docs/domain.md`.
5. Open from the #8 review: an ESLint rule against `process.env` outside `src/env*.ts`,
   `next.config.ts` and the tooling config.
