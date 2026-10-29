# Deploying to production

Production is `https://squadio.utitytools.com`: a Vercel project in `fra1` and a Neon project in
AWS Frankfurt. Only GitHub Actions deploys, and only from `main` after CI passed
([ADR 0006](../adr/0006-deploys-from-github-actions.md)). Pull requests get previews instead: see
[`preview.md`](preview.md).

## How a deploy works

1. A PR is merged into `main` and CI runs on the new commit.
2. When CI passes, [`deploy.yml`](../../.github/workflows/deploy.yml) checks that the commit is
   still the tip of `main`. If a newer commit landed meanwhile, this deploy is skipped and the newer
   one ships.
3. In the `production` environment, on the exact commit CI tested, `vercel pull` and
   `vercel build --prod` build the app in the runner. A failed build stops here, with the database
   untouched.
4. `pnpm db:check-target owner` fails unless `DATABASE_OWNER_URL` leads to `squadio_owner` on
   `squadio`: a string pointing elsewhere would still migrate, and go green
   ([post-mortem](../incidents/2026-10-23-migrations-in-neondb.md)). Then `pnpm db:migrate`
   applies pending migrations.
5. `pnpm db:check-target app` checks the `DATABASE_URL` that `vercel pull` wrote leads to
   `squadio_app` on `squadio`, and `pnpm db:seed` replaces the synthetic demo organization with
   it. The seed runs in one transaction with fixed ids, so the running deployment never sees a
   half-written demo.
6. `vercel deploy --prebuilt --prod` uploads the build and promotes it.
7. A smoke test opens the guide scenario on the production domain and fails unless it answers 200
   and shows the scenario's name. A missing scenario also answers 200, because the page streams.
   The new deployment is live by then: if the smoke test fails, roll back (below).

A deploy can also be started by hand from the Actions tab (**Deploy → Run workflow**, branch `main`)
to ship the tip of `main` again. It fails unless CI passed on that commit; the check retries for
about 100 seconds first, because GitHub's list of runs can lag.

### Migrations must be backwards compatible

The previous deployment keeps serving traffic while migrations run, and a rollback only reverts the
app, never the database. So a migration must work with both the old and the new code:

- **Expand, then contract.** Add columns and tables first; drop or rename them in a later deploy,
  once no running code uses them.
- New `NOT NULL` columns get a default or are backfilled before the constraint.
- Migrations are forward-only: undo one with a new migration.

## Rolling back

```bash
pnpm exec vercel rollback
```

This points production back at the previous deployment without rebuilding. It does not touch the
database.

While a rollback is active, Vercel stops promoting new production deployments: `deploy.yml` still
goes green, but its deployment never takes the domain. Once the fix is merged and deployed, promote
it by hand and check the domain serves it:

```bash
pnpm exec vercel ls --prod
pnpm exec vercel promote <deployment-url>
```

## Cleaning up visitor copies and reseeding the demo

[`clean-up.yml`](../../.github/workflows/clean-up.yml) runs daily at 04:17 UTC in the `production`
environment, with two independent jobs. To run it by hand, **Clean up → Run workflow**, branch
`main`. It needs no setup beyond the deploy's secrets and variables.

**Delete idle visitor copies.** It checks `DATABASE_OWNER_URL` with
`pnpm db:check-target owner`, then `pnpm db:clean-up` deletes every visitor's copy of the demo with
no save in 30 days, rows and claim
([ADR 0011](../adr/0011-saving-edits-and-the-visitor-copy.md), "Clean-up"). Its log says how many it
deleted.

Each copy goes in its own transaction. A copy whose claim stays locked for 10 seconds is skipped:
the run deletes the rest, names the skipped organizations in its log and fails, and the next day's
run tries them again. The job stops after 10 minutes, enough for thousands of copies; a larger
backlog is finished over the following days, or by running it again by hand.

It runs the code on `main`, while production may still be on the previous deploy. A run that
meets a deploy at 04:17 UTC can make one save or one day's run fail, never a half-deleted copy.

**Reseed the demo template.** A first job, without secrets, finds the commit production last
deployed: the newest Deploy run whose deploy job succeeded. The reseed runs that commit's code, not
`main`'s tip, which can be ahead of production's schema. It runs the deploy's `vercel pull`, without
the build, then steps 5 and 7: the seed as `squadio_app` and the smoke test. The demo's ongoing
scenarios then follow today ([domain](../domain.md), "The demo's dates"); visitors' copies are left
alone. A failed reseed leaves the previous demo, since the seed is one transaction, and tomorrow's
run tries again. A reseed failing every day on the date means the national calendar needs a new
year (rule h).

- **A deploy is queued or running:** the reseed is skipped, since that deploy seeds anyway.
- **A deploy that starts in the seconds after that check:** the reseed shares the deploy's
  concurrency group. Once it holds the group, it checks again and gives way if a newer deploy ran
  meanwhile, since that deploy has seeded. The group also keeps only one pending run, so either one
  can replace the other. A replaced deploy shows as
  **cancelled** (not failed, so GitHub sends no email) around 04:17 UTC: run
  **Deploy → Run workflow** by hand.
- **After a `vercel rollback`:** production runs an older deployment than the last Deploy run, so
  the reseed would use newer code. Pause the schedule (**Clean up → ⋯ → Disable workflow**) until a
  new deploy is promoted.

## One-time setup

Done once, by the owner, in this order. Never paste connection strings, passwords or tokens into a
chat, an issue or a commit.

### 1. Neon project

Create a project named `squadio`: Postgres 18, region AWS Europe Central 1 (Frankfurt). Do not create
roles or databases from the console: Neon makes those members of `neon_superuser`, which has
`BYPASSRLS` ([ADR 0004](../adr/0004-tenant-isolation-with-rls.md)).

### 2. Roles and database

`psql` prints the arguments it could not use in its error messages, password included. So never
pass a connection string in a way `psql` could misread (`-d <url>` makes it a role name), and check
what a variable holds before using it.

Create two passwords in the password manager first, `squadio_owner` and `squadio_app`: at least 32
characters, letters and digits only (`@ : / ? #` break the connection strings below).

Copy the **direct** connection string of `neondb_owner` on `neondb` from Neon's **Connect** dialog
(connection pooling off): the whole string, not only the password. Then, from the repository root:

```bash
read -rs "NEON_ADMIN_URL?neondb_owner URL: "
[[ $NEON_ADMIN_URL == postgresql://* ]] && echo "looks like a URL" || echo "not a URL: load it again"
read -rs "SQUADIO_OWNER_PASSWORD?squadio_owner password: " && export SQUADIO_OWNER_PASSWORD
read -rs "SQUADIO_APP_PASSWORD?squadio_app password: " && export SQUADIO_APP_PASSWORD
psql "$NEON_ADMIN_URL" -Atc 'show server_version'
psql "$NEON_ADMIN_URL" -f infra/neon/bootstrap.sql
unset NEON_ADMIN_URL SQUADIO_OWNER_PASSWORD SQUADIO_APP_PASSWORD
```

(`read -rs "VAR?prompt"` is zsh, the macOS default; in bash use `read -rsp "prompt" VAR`.) The
server version must be 18 ([ADR 0007](../adr/0007-postgres-18.md)).

[`infra/neon/bootstrap.sql`](../../infra/neon/bootstrap.sql) creates `squadio_owner`,
`squadio_app` and the `squadio` database, and fails if either role can reach a superuser or
`BYPASSRLS` role. A failed check rolls the roles back, so the script can run again.

Check the result in Neon's **SQL Editor** with the database selector on `squadio`, so no connection
string is involved:

```sql
SELECT current_database() AS db,
       pg_get_userbyid(nspowner) AS owner,
       nspacl AS privileges
FROM pg_namespace
WHERE nspname = 'public';
```

Expected: `db` is `squadio`, `owner` is `pg_database_owner` (that is, `squadio_owner`), and
`privileges` includes `squadio_app=U`, with `C` only for `pg_database_owner`. On Postgres 15 and
later `PUBLIC` keeps `U` without `C`, which is harmless: it cannot connect to `squadio`. If
`squadio_app` is missing from the list, the editor is on `neondb`.

Finally, reset the `neondb_owner` password (**Roles → ⋮ → Reset password**) and close the dialog
without copying it. Nothing needs it day to day; reset it again whenever it is needed.

The two connection strings used below take the host from Neon's **Connect** dialog, with its
database selector on `squadio`: it defaults to `neondb`, and a string on `neondb` still connects and
migrates ([post-mortem](../incidents/2026-10-23-migrations-in-neondb.md)). Neon does not know the
passwords of roles created with SQL, so the dialog shows a placeholder: compose each string in the
password manager, never in a shell or a chat. Keep one entry per string, named after its variable.

| Name                 | Role            | Host                    | Database  |
| -------------------- | --------------- | ----------------------- | --------- |
| `DATABASE_OWNER_URL` | `squadio_owner` | direct (`ep-…`)         | `squadio` |
| `DATABASE_URL`       | `squadio_app`   | pooled (`ep-…-pooler…`) | `squadio` |

Both have the form `postgresql://<role>:<password>@<host>/squadio?sslmode=verify-full`. Today `pg`
treats `require` as `verify-full`, but its next major gives `require` libpq's weaker meaning, so
the strings say `verify-full`. The pooler runs in transaction mode, which is safe because
`withOrganization` sets the tenant per transaction.

Check where each string leads before storing it anywhere else. The deploy runs the same check:

```bash
read -rs "DATABASE_OWNER_URL?DATABASE_OWNER_URL: " && export DATABASE_OWNER_URL
pnpm db:check-target owner
unset DATABASE_OWNER_URL
read -rs "DATABASE_URL?DATABASE_URL: " && export DATABASE_URL
pnpm db:check-target app
unset DATABASE_URL
```

To check one with `psql` instead, add `sslrootcert=system` to its query string: libpq only uses the
system's root certificates with it, while Node's `pg` uses Node's bundled ones (and would read
`system` as a file path, so never store the string with it).

### 3. Vercel project

```bash
pnpm exec vercel project add squadio
pnpm exec vercel link --yes --project squadio
cat .vercel/project.json
```

`.vercel/` is ignored by git. `project.json` holds the `orgId` and `projectId` for the next step.
`vercel link` also writes a `VERCEL_OIDC_TOKEN` into `.env.local` and keeps the rest of the file.

- A project created with `vercel project add` gets the "Other" framework preset, which would build
  a static site. `vercel build` takes `framework` from `vercel.json`, which pins `nextjs`, so the
  dashboard preset does not matter to deploys; set it to Next.js anyway so the dashboard tells the
  truth. `pnpm exec vercel project inspect squadio` must show **Node.js Version: 24.x**, which only
  lives in the project settings.
- Git deployments stay off (`vercel.json`): the project is not connected to the repository.

Create a token at <https://vercel.com/account/settings/tokens>, scoped to the team that owns the
project (`utity-tools-projects`, not the personal account), with an expiry. Store it in the
password manager only; the next step reads it from a prompt. Record the expiry here:

| Token                    | Scope                  | Expires    |
| ------------------------ | ---------------------- | ---------- |
| `squadio-github-actions` | `utity-tools-projects` | 2027-10-20 |

### 4. Secrets and variables

GitHub environment `production`, limited to the `main` branch, and its variables (the IDs from
`project.json`, which are not secrets):

```bash
gh api -X PUT repos/utity-tools/squadio/environments/production \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/utity-tools/squadio/environments/production/deployment-branch-policies \
  -f name=main -f type=branch
gh variable set VERCEL_ORG_ID --env production -R utity-tools/squadio \
  --body "$(jq -r .orgId .vercel/project.json)"
gh variable set VERCEL_PROJECT_ID --env production -R utity-tools/squadio \
  --body "$(jq -r .projectId .vercel/project.json)"
```

The secrets, pasted from the password manager. `gh secret set` prompts for the value, so nothing
lands in the shell history:

```bash
gh secret set VERCEL_TOKEN --env production -R utity-tools/squadio
gh secret set DATABASE_OWNER_URL --env production -R utity-tools/squadio
gh secret list --env production -R utity-tools/squadio
```

Vercel, Production environment. `NEXT_PUBLIC_APP_URL` is public; `DATABASE_URL` is pasted at the
prompt:

```bash
printf '%s' 'https://squadio.utitytools.com' |
  pnpm exec vercel env add NEXT_PUBLIC_APP_URL production --type config
pnpm exec vercel env add DATABASE_URL production --type config
pnpm exec vercel env ls production
```

Both must be **Config**, never **Secret**, which the CLI recommends for credential-like names:
Vercel never returns secret (sensitive) values, so `vercel pull` would leave `DATABASE_URL` empty
and `next build`, which validates it, would fail
([ADR 0006](../adr/0006-deploys-from-github-actions.md)). `--type config` makes the choice
explicit, since a piped or non-interactive run cannot answer the prompt. Config values are still
encrypted and readable only by members of the Vercel team. The dashboard later suggests **Change to
Secret** for `DATABASE_URL`: decline it, as the post-mortem explains.

### 5. Domain

```bash
pnpm exec vercel domains add squadio.utitytools.com squadio
pnpm exec vercel domains verify squadio.utitytools.com
```

`verify` prints the expected record under `recommended.records`: a `CNAME` named `squadio` whose
target is specific to the project (`<hash>.vercel-dns-017.com`). In Cloudflare (zone
`utitytools.com`), add it with the proxy **off** (grey cloud, DNS only), so Vercel can issue the
certificate. Ignore the warning about nameservers: DNS stays on Cloudflare. Run `verify` again
until it reports `configured-correctly`.

### 6. First deploy

The deploy that runs when the setup PR is merged fails at `vercel pull` if the secrets do not exist
yet; it stops before the build, with the database untouched. Once steps 1 to 5 are done:

```bash
gh workflow run deploy.yml -R utity-tools/squadio --ref main
```

When it finishes, check that `https://squadio.utitytools.com` loads and its certificate is valid.

### 7. Rate limit on first saves

A visitor's first save makes their copy of the demo ([ADR 0011](../adr/0011-saving-edits-and-the-visitor-copy.md),
"Abuse"). One firewall rule limits first saves per IP; saves from a visitor who already has a copy
carry the cookie and never meet it. In the Vercel dashboard, project `squadio`, Firewall, Configure,
New Rule:

- **Name:** `First saves per IP`.
- **If:** Request Method equals `POST`, and Request Header `Next-Action` exists, and Cookie
  `squadio_visitor` does not exist.
- **Then:** Rate Limit, fixed window, 10 minutes, 10 requests, keyed by IP, action Deny.

Review Changes, then Publish. Hobby allows one rate limit rule per project, so this is it.

## Rotating credentials

- **Database passwords** (`squadio_app` shown; the same for `squadio_owner`). Not in the SQL
  Editor, which keeps every statement in its query history:
  1. Create the new password in the password manager.
  2. Reset the `neondb_owner` password in Neon and copy the direct URL from **Connect**, as in
     step 2.
  3. Load both and change the password through `\getenv`, as the bootstrap does, so it never
     reaches the command line:

     ```bash
     read -rs "NEON_ADMIN_URL?neondb_owner URL: "
     [[ $NEON_ADMIN_URL == postgresql://* ]] && echo "looks like a URL" || echo "not a URL: load it again"
     read -rs "SQUADIO_APP_PASSWORD?new squadio_app password: " && export SQUADIO_APP_PASSWORD
     psql "$NEON_ADMIN_URL" -v ON_ERROR_STOP=1 <<'SQL'
     \getenv app_password SQUADIO_APP_PASSWORD
     ALTER ROLE squadio_app PASSWORD :'app_password';
     SQL
     unset NEON_ADMIN_URL SQUADIO_APP_PASSWORD
     ```

  4. Reset the `neondb_owner` password again without copying it.
  5. Update `DATABASE_URL` in Vercel and redeploy (for `squadio_owner`: `DATABASE_OWNER_URL` in
     GitHub).
- **Vercel token:** create the new one, update `VERCEL_TOKEN`, then revoke the old one.
