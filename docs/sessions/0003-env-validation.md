# 0003: Environment variables validated with Zod (step 7)

- **Date:** 2026-10-14
- **Branch at close:** `main` at `0c94318`
- **PRs:** [#8](https://github.com/utity-tools/squadio/pull/8) merged; Dependabot
  [#6](https://github.com/utity-tools/squadio/pull/6) and
  [#7](https://github.com/utity-tools/squadio/pull/7) closed

## Done

- Step 7 ([#8](https://github.com/utity-tools/squadio/pull/8)): pure parsers in
  `src/lib/env/schema.ts` (21 tests, one fast-check property), entry points `src/env.ts`
  (server-only) and `src/env.client.ts`, validation in `next.config.ts`, `.env.example`, a README
  section and a synthetic `NEXT_PUBLIC_APP_URL` at workflow level in CI.
- Dependabot ignores `@types/node` majors; zod, server-only and fast-check installed.
- Handoff 0002 committed.

## State

- `main` is clean apart from this file, which goes into the next branch.
- The owner has a local `.env.local` copied from `.env.example`.

## Decisions

- Validation is hand-written over Zod 4 instead of `@t3-oss/env-nextjs`: about 40 lines, tested,
  one dependency fewer. Covered by ADR 0001 (Zod for env vars); no new ADR.
- Error messages are custom so they name variables and never quote values (no secrets in logs).
- `NEXT_PUBLIC_APP_URL` must be an http(s) origin: no path, no trailing slash.
- Each variable enters the schema and `.env.example` in the commit that starts using it.

## Gotchas

- `next.config.ts` validates the env, and `next typegen` loads it: `pnpm typecheck` fails without
  `.env.local` (or the variables exported). CI sets them at workflow level.
- `guard-bash` blocks any shell command that mentions a `.env` path, writes included: edit
  `.env.example` with the Write/Edit tools.
- Zod 4 runs later checks even after one fails: put all URL rules in one `refine` so an invalid
  value yields a single message line.
- GitHub deletes merged branches on its own; `git push origin --delete` then fails harmlessly.

## Next

1. Step 8: database. Postgres 17 in Docker (`docker-compose.yml`, shared with CI), Drizzle,
   migrations, RLS enabled and forced, DB tests under `tests/` with `*.db.test.ts` and their own
   Vitest config. Add `DATABASE_URL` to the env schema and `.env.example` in the same commit.
   Branch `build/database`; start with `/feature database with drizzle and rls`, and commit this
   handoff in that branch.
2. Review notes from #8 still open: an ESLint rule against `process.env` outside `src/env*.ts` and
   `next.config.ts`; Zod in the client bundle once `env.client.ts` is used.
3. Step 9: Vercel, Neon and DNS. Set `NEXT_PUBLIC_APP_URL` for Preview deployments too, or preview
   builds fail at config load.
