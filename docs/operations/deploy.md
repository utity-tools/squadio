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
4. `pnpm db:migrate` applies pending migrations as `squadio_owner`.
5. `vercel deploy --prebuilt --prod` uploads the build and promotes it.

A deploy can also be started by hand from the Actions tab (**Deploy → Run workflow**, branch `main`)
to ship the tip of `main` again. It fails unless CI passed on that commit.

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

The two connection strings used below take the host from Neon's **Connect** dialog. Neon does not
know the passwords of roles created with SQL, so the dialog shows a placeholder: compose each string
in the password manager, never in a shell or a chat.

| Name                 | Role            | Host                    | Database  |
| -------------------- | --------------- | ----------------------- | --------- |
| `DATABASE_OWNER_URL` | `squadio_owner` | direct (`ep-…`)         | `squadio` |
| `DATABASE_URL`       | `squadio_app`   | pooled (`ep-…-pooler…`) | `squadio` |

Both have the form `postgresql://<role>:<password>@<host>/squadio?sslmode=verify-full`. Today `pg`
treats `require` as `verify-full`, but its next major gives `require` libpq's weaker meaning, so
the strings say `verify-full`. The pooler runs in transaction mode, which is safe because
`withOrganization` sets the tenant per transaction.

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
encrypted and readable only by members of the Vercel team.

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
