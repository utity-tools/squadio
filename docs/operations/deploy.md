# Deploying to production

Production is `https://squadio.utitytools.com`: a Vercel project in `fra1` and a Neon project in
AWS Frankfurt. Only GitHub Actions deploys, and only from `main` after CI passed
([ADR 0006](../adr/0006-deploys-from-github-actions.md)).

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

Create a project named `squadio`: Postgres 17, region AWS Europe Central 1 (Frankfurt). Do not create
roles or databases from the console: Neon makes those members of `neon_superuser`, which has
`BYPASSRLS` ([ADR 0004](../adr/0004-tenant-isolation-with-rls.md)).

### 2. Roles and database

From the repository root, with the **direct** (not pooled) connection string of `neondb_owner` on
`neondb`:

```bash
read -rs "NEON_ADMIN_URL?neondb_owner URL: "
export SQUADIO_OWNER_PASSWORD=$(openssl rand -hex 24) SQUADIO_APP_PASSWORD=$(openssl rand -hex 24)
psql "$NEON_ADMIN_URL" -f infra/neon/bootstrap.sql
```

(`read -rs "VAR?prompt"` is zsh, the macOS default; in bash use `read -rsp "prompt" VAR`.)

[`infra/neon/bootstrap.sql`](../../infra/neon/bootstrap.sql) creates `squadio_owner`,
`squadio_app` and the `squadio` database, and fails if either role can reach a superuser or
`BYPASSRLS` role. A failed check rolls the roles back, so the script can run again.

Check the result on Neon, which may set up `public` differently from plain Postgres: `public` must
be owned by `pg_database_owner`, `squadio_app` must have `U` (usage) on it, and only
`squadio_owner` may have `C` (create).

```bash
psql "$NEON_ADMIN_URL" -c '\l squadio' -c '\connect squadio' -c '\dn+ public'
```

Store both passwords in a password manager, then clear them from the shell:

```bash
unset NEON_ADMIN_URL SQUADIO_OWNER_PASSWORD SQUADIO_APP_PASSWORD
```

The two connection strings used below take the host from Neon's **Connect** dialog:

| Name                 | Role            | Host                    | Database  |
| -------------------- | --------------- | ----------------------- | --------- |
| `DATABASE_OWNER_URL` | `squadio_owner` | direct (`ep-…`)         | `squadio` |
| `DATABASE_URL`       | `squadio_app`   | pooled (`ep-…-pooler…`) | `squadio` |

Both have the form `postgresql://<role>:<password>@<host>/squadio?sslmode=require`. The pooler runs
in transaction mode, which is safe because `withOrganization` sets the tenant per transaction.

### 3. Vercel project

```bash
pnpm exec vercel project add squadio
pnpm exec vercel link --yes --project squadio
cat .vercel/project.json
```

`.vercel/` is ignored by git. `project.json` holds the `orgId` and `projectId` for the next step.
In the project settings, set the Node.js version to 24.x. Git deployments stay off
(`vercel.json`): the project is not connected to the repository.

Create a token at <https://vercel.com/account/tokens>, scoped to the team that owns the project,
with an expiry, and note its expiry date here when rotating it.

### 4. Secrets and variables

GitHub environment `production`, limited to the `main` branch:

```bash
gh api -X PUT repos/utity-tools/squadio/environments/production \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/utity-tools/squadio/environments/production/deployment-branch-policies \
  -f name=main -f type=branch
gh variable set VERCEL_ORG_ID --env production
gh variable set VERCEL_PROJECT_ID --env production
gh secret set VERCEL_TOKEN --env production
gh secret set DATABASE_OWNER_URL --env production
```

Each `set` command prompts for its value, so nothing lands in the shell history.

Vercel, Production environment. Do **not** mark `DATABASE_URL` as sensitive: Vercel never returns
sensitive values, so `vercel pull` would leave it empty and `next build`, which validates it, would
fail ([ADR 0006](../adr/0006-deploys-from-github-actions.md)).

```bash
pnpm exec vercel env add NEXT_PUBLIC_APP_URL production
pnpm exec vercel env add DATABASE_URL production
```

`NEXT_PUBLIC_APP_URL` is `https://squadio.utitytools.com`.

### 5. Domain

```bash
pnpm exec vercel domains add squadio.utitytools.com squadio
```

Vercel prints the DNS record it expects. In Cloudflare (zone `utitytools.com`), add it as a `CNAME`
named `squadio` with the proxy **off** (grey cloud, DNS only), so Vercel can issue the certificate.

### 6. First deploy

Run **Deploy** by hand from the Actions tab. When it finishes, check that
`https://squadio.utitytools.com` loads and its certificate is valid.

## Rotating credentials

- **Database passwords:** as `neondb_owner`, `ALTER ROLE squadio_app PASSWORD '…'` (same for
  `squadio_owner`), then update `DATABASE_URL` in Vercel (and redeploy) or `DATABASE_OWNER_URL` in
  GitHub.
- **Vercel token:** create the new one, update `VERCEL_TOKEN`, then revoke the old one.
