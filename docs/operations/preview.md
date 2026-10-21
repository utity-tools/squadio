# Preview deployments

Every pull request from this repository gets a preview at `https://squadio-pr-<number>.vercel.app`,
backed by a Neon branch of its own, `preview/pr-<number>`. Closing the pull request deletes both
([ADR 0009](../adr/0009-preview-deployments.md)). Pull requests from forks and from Dependabot get
no secrets, so they get no preview.

## How a preview works

[`preview.yml`](../../.github/workflows/preview.yml) runs on every push to a pull request:

1. `vercel pull` and `vercel build` build the app in the runner, before any secret exists. The build
   gets a synthetic `DATABASE_URL`: `next.config.ts` only validates it, so no real credential can
   end up in the output.
2. The previous `preview/pr-<number>` branch, if any, is deleted and a new one is created from
   `preview-template`. It expires after 14 days as a safety net.
3. The passwords of `squadio_owner` and `squadio_app` are reset on that branch through the Neon API
   and masked in the log. They match neither production nor any other preview.
4. [`infra/neon/role-check.sql`](../../infra/neon/role-check.sql), the bootstrap's check, runs as
   `squadio_app`: if either role can reach a superuser or `BYPASSRLS` role, the preview stops here.
5. The new passwords are searched for in the build output; finding one stops the preview.
6. `pnpm db:migrate` applies, as `squadio_owner`, the migrations added since the template was made.
7. `vercel deploy --prebuilt` deploys with `DATABASE_URL` (as `squadio_app`, through the pooler)
   and `NEXT_PUBLIC_APP_URL` as run-time variables, and `vercel alias set` points the stable URL at
   it.

A newer push cancels a running preview. A close waits for it, then deletes the branch and the alias.
Deleting the branch also kills the credentials that older preview deployments still hold.

## Opening a preview

Previews sit behind Vercel Authentication: open the URL from the pull request and sign in to Vercel,
or from a terminal linked to the project:

```bash
pnpm exec vercel curl / --deployment https://squadio-pr-<number>.vercel.app
```

## The template branch

`preview-template` is a normal child of `production`, created on 2026-10-21 while production held
no tables. It keeps production's roles exactly, and its own role passwords were reset so they do
not match production's.

- **Never reset it from its parent**, and never restore it from production: it would copy
  production's data into every later preview. The free plan cannot protect it, so this rule is the
  only guard. If it ever has to be rebuilt once production holds data, that needs a new decision.
- **Never delete it.** Without it every preview fails at step 2.
- The free plan allows 10 branches: `production`, the template and at most 8 previews. If creating
  a branch fails on the limit, close or merge stale pull requests.

## One-time setup

Done once, by the owner. Never paste a key or a token into a chat, an issue or a commit.

### 1. Neon API key

Create an API key in the Neon console scoped to the `squadio` project only, if the account offers
project-scoped keys; otherwise stop and decide, since a personal key reaches every project. Store it
in the password manager.

### 2. Vercel token

Create a token at <https://vercel.com/account/settings/tokens> for previews only, scoped to
`utity-tools-projects`, with an expiry, so it can be revoked without touching production's. Hobby
has no narrower scope: it can still deploy to production, which is why the workflow only runs for
this repository's own pull requests. Record it here:

| Token                     | Scope                  | Expires    |
| ------------------------- | ---------------------- | ---------- |
| `squadio-github-previews` | `utity-tools-projects` | 2027-10-21 |

### 3. GitHub environment

An environment named `preview` with no branch restriction, since pull requests come from any
branch. Its variables are not secrets: the Neon project ID is in **Settings → General** in Neon, and
the Vercel IDs are the same as production's.

```bash
gh api -X PUT repos/utity-tools/squadio/environments/preview
gh variable set NEON_PROJECT_ID --env preview -R utity-tools/squadio
gh variable set VERCEL_ORG_ID --env preview -R utity-tools/squadio \
  --body "$(jq -r .orgId .vercel/project.json)"
gh variable set VERCEL_PROJECT_ID --env preview -R utity-tools/squadio \
  --body "$(jq -r .projectId .vercel/project.json)"
```

The secrets, pasted from the password manager. `gh secret set` prompts for the value, so nothing
lands in the shell history:

```bash
gh secret set NEON_API_KEY --env preview -R utity-tools/squadio
gh secret set VERCEL_TOKEN --env preview -R utity-tools/squadio
gh secret list --env preview -R utity-tools/squadio
```

## Rotating credentials

- **Neon API key:** create the new one, update `NEON_API_KEY`, then revoke the old one.
- **Vercel token:** create the new one, update `VERCEL_TOKEN` in `preview`, then revoke the old one.
- **Preview database passwords** need no rotation: every run makes new ones.
