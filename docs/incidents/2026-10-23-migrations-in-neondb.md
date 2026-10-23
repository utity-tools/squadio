# 2026-10-23: production migrations ran against the `neondb` database

- **Date:** 2026-10-23
- **Duration:** three days latent (from the first deploy on 2026-10-20), about an hour to fix once
  investigated
- **Impact:** `/scenarios/<id>` never worked in production; the home page did. No users yet and no
  data lost: the demo organization had not been seeded.
- **Status:** resolved

## Summary

Both production connection strings ended in `/neondb`, the database Neon preselects in its
**Connect** dialog, instead of `/squadio`. Every deploy applied the migrations to `neondb`, and the
app could not reach the tables: first because `squadio_app` may not connect to `neondb`, then, with
`DATABASE_URL` fixed, because `squadio` was empty.

## Timeline

Times in UTC.

1. 2026-10-20 14:50: the first production deploy
   ([39442924322](https://github.com/utity-tools/squadio/actions/runs/39442924322)) applied the
   migrations to `neondb`. `drizzle-kit migrate` reported success.
2. 2026-10-22: opening the guide scenario failed with `permission denied for database "neondb"`.
3. 2026-10-23, morning: `DATABASE_URL` was recreated in Vercel with the `squadio_app` role, the
   pooled host and `/squadio`, as a **Secret** variable.
4. 10:11: the Deploy run after merging [#37](https://github.com/utity-tools/squadio/pull/37)
   ([39937298176](https://github.com/utity-tools/squadio/actions/runs/39937298176)) failed at
   **Build**: `vercel pull` writes Secret values empty, and `next.config.ts` rejected the empty
   `DATABASE_URL`. Production stayed on the previous deployment.
5. `DATABASE_URL` was recreated as **Config**. The retried run deployed at 10:26, and the scenario
   now failed with `relation "scenarios" does not exist`.
6. In Neon's SQL Editor, `pg_tables` listed ten tables in `neondb.public` and the `drizzle` schema,
   and none in `squadio`.
7. The `squadio_owner` password was confirmed with a local `psql` test, and the GitHub secret
   `DATABASE_OWNER_URL` was set to `/squadio`. A manual deploy
   ([39942161498](https://github.com/utity-tools/squadio/actions/runs/39942161498)) applied every
   migration to `squadio` at 10:53.
8. `pnpm db:seed` ran, and the guide scenario rendered its team.

## Root cause

The connection strings were composed from Neon's **Connect** dialog, which defaults to the `neondb`
database, and nothing checked where they pointed. A migration against the wrong database succeeds:
`squadio_owner` may create tables in `neondb`, so the deploy stayed green.

## Contributing factors

- **The Secret type.** Recreating `DATABASE_URL` as Secret contradicted
  [ADR 0006](../adr/0006-deploys-from-github-actions.md) and the runbook, which both require Config.
  Vercel recommends Secret for credential-like names, which made the wrong choice look right.
- **`information_schema` hides tables.** It lists only the tables the current role has privileges
  on, so a check from the SQL Editor (as `neondb_owner`) can report an empty database that is not.
  `pg_tables` lists them all.
- **Ambiguous password manager entries.** Several entries had similar names, and the first one tried
  for `squadio_owner` held a stale password.
- **`verify-full` differs between clients.** Local `psql` needs `sslrootcert=system` to use the
  system roots; Node's `pg` already does, and would read `system` as a file path.

## What went well

- Building before migrating meant the failed build left the database untouched, and production
  stayed up throughout.
- The Vercel runtime logs named each error exactly.
- No credential was pasted into a chat, a shell history or the SQL Editor.

## Fix

- `DATABASE_URL` (Vercel, Production, Config): `squadio_app`, pooled host, `/squadio`,
  `sslmode=verify-full&channel_binding=require`.
- `DATABASE_OWNER_URL` (GitHub environment `production`): `squadio_owner`, direct host, `/squadio`,
  the same parameters.
- The migrations were applied to `squadio` and the demo organization was seeded.

## Follow-ups

- The deploy checks its target: after migrating, fail unless `current_database()` is `squadio` and
  `current_user` is `squadio_owner`.
- A smoke test after the deploy requests a page that reads the database and fails on a 5xx.
- The runbook says to pick the `squadio` database in **Connect**, adds the `psql` check with
  `sslrootcert=system`, and warns against Vercel's "Change to Secret" prompt.
- Drop the stale tables and the `drizzle` schema from `neondb`.
- One password manager entry per connection string, named after its variable.

## Lessons

- A green migration proves only that it ran somewhere: check the target, not the exit code.
- When a platform recommends a setting, check it against the ADRs before applying it.
