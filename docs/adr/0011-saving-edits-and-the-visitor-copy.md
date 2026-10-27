# 0011. Saving edits and the visitor's copy

- **Status:** accepted
- **Date:** 2026-10-27

## Context

v0.2 lets people edit a scenario's team ([plan](../plan.md#v02-slices),
[domain](../domain.md#editing-a-scenario)), but sign-in only arrives in v0.5. Until then production
holds one organization, the demo, served with rate access to anyone ([ADR 0005](0005-rate-access-in-the-database.md),
amendment of 2026-10-21), and every deploy reseeds it ([ADR 0006](0006-deploys-from-github-actions.md),
amendment of 2026-10-26). Shared edits would be wiped on each deploy and would let one visitor
vandalise what the next one sees.

The owner chose, on 2026-10-26, to give each visitor a copy of the demo organization, found through
an anonymous cookie and made on the first edit. The rejected options are in
[handoff 0013](../sessions/0013-small-polish-and-v02-plan.md#decisions). This ADR fixes how the
copy and saving work.

Three facts from the code shape it:

- Every tenant table's primary key is `id` alone, so a copy needs new ids.
- [ADR 0004](0004-tenant-isolation-with-rls.md) forces RLS on every tenant table and gives no role
  `BYPASSRLS`, so neither role can read across organizations without setting a context.
- The scenario page is already rendered per request: it reads `searchParams` and queries the
  database with no `'use cache'`.

## Decision

Edits are saved as lists of changes against a version, with optimistic locking, into a copy of the
demo template that belongs to the visitor and is found through a random token in a cookie.

### Saving

- **One Server Action,** `saveScenarioChanges({ scenarioId, baseVersion, changes })`. It validates
  the input with Zod, then in one transaction: locks the scenario row, compares its `version` with
  `baseVersion`, re-checks every change against the stored team with the same pure functions as the
  client, applies them and increments `version`. It returns the new version, or a conflict with the
  current version and nothing written.
- **Conflicts only happen across tabs,** since nobody else edits a visitor's copy. The client shows
  that the scenario changed elsewhere and offers to reload; it never merges.
- **The client saves on its own,** shortly after the last change and one save at a time. The header
  shows saving, saved or failed.
- **Writes never touch the demo template.** The action refuses to write to it, whatever the context
  says, and a DB test proves it.

### The cookie

- **A token, never the organization id:** 32 random bytes (`crypto.getRandomValues`), base64url,
  in a cookie named `squadio_visitor`. HttpOnly, Secure, SameSite=Lax, Path `/`, Max-Age 30 days,
  renewed on every save.
- **The database keeps only its SHA-256 hash.** A dump of the table cannot be turned back into
  cookies. A plain hash is enough: the token has 256 bits of entropy, so there is nothing to guess.
- **An unknown or expired token is no copy.** The visitor reads the template, and the next edit
  makes a new copy and replaces the cookie.

### When the copy is made

On the **first save**, not the first visit: bots and visitors who only read cost nothing, and until
then the visitor reads the template. The same transaction that makes the copy applies the first
changes, so a visitor never has an empty copy.

### The copy

- **One transaction, run by `squadio_app`, with no new privilege.** It sets the template's context
  (with rate access, since restricted tables are copied too), reads every tenant row, switches
  `app.organization_id` to the new organization and inserts the rows. Both settings are
  transaction-local, so RLS checks every statement against the context in force. The app could
  already act for any organization it names; what limits it is that the organization comes from the
  cookie's mapping, not from the request.
- **Its own context, not the request's.** The copy always runs with rate access, also for a visitor
  on `?access=none`, who still never sees money: their pages keep the request's context.
- **New ids are derived, not random:** each row's id in the copy is the UUIDv5 of the template id
  in the namespace of the copy's organization id. The mapping needs no table: the action translates
  the first batch of changes, which name template ids, and a visitor with a copy who opens a link to
  a template scenario (the README's guide scenario) is redirected to their copy of it.
- **Composite foreign keys survive** because every reference is mapped the same way. Each scenario
  keeps the template's `version`.
- **Claim first.** The transaction calls `app.claim_visitor_copy` before copying, so a copy refused
  by the limit costs nothing and a failed copy releases its claim.
- **Copies are not migrated apart:** they are rows like any other, so migrations reach them. A seed
  change does not: copies keep the template they were made from.

### The visitor table

- **`visitor_copies`:** `token_hash` (bytea, primary key), `organization_id` (uuid, unique),
  `created_at`, `last_saved_at`. It has no tenant: a row maps a visitor to an organization.
- **RLS enabled, not forced, and no policy.** `squadio_app` has no privilege on it at all.
- **Two `SECURITY DEFINER` functions,** owned by `squadio_owner` and granted to `squadio_app` only
  (ADR 0004: new functions are not executable by `PUBLIC`):
  - `app.visitor_organization(token_hash)` returns the copy's organization id, or null;
  - `app.claim_visitor_copy(token_hash, organization_id)` inserts the row if the daily limit allows
    (see Abuse), returns whether it did, and updates `last_saved_at` when the row exists.

  As the table's owner, and with RLS not forced on this table only, the functions read it without a
  context. They take a hash, never return another visitor's row and have a fixed `search_path`.

- **The guard test names it as the one exception:** the only table with `organization_id` whose RLS
  is enabled but not forced and has no policy. The test checks exactly that, and that the app has no
  privilege on it.

### Access

`currentAccessContext()` becomes async and is still the only place a context is built: it reads the
cookie, asks `app.visitor_organization`, and returns the copy's organization or else the demo
template, with rate access. `?access=none` still only takes rate access away.

### Rendering

The scenario page is already dynamic, so reading the cookie adds a function call to a transaction
it already opens, not a new rendering cost. Slice 2 measures the time to first byte of the guide
scenario before and after, with and without a cookie, against a production build, and records it in
its PR. If a page is ever cached, the cache key must include the organization, as ADR 0005 already
requires for rate access.

### Clean-up

- **A copy is deleted after 30 days without a save,** matching the cookie's life.
- **A scheduled GitHub Actions workflow,** daily, in the `production` environment, as
  `squadio_owner` with `DATABASE_OWNER_URL`, the only role that reads `visitor_copies` directly. For
  each idle copy it deletes its tenant rows inside its own context (RLS is forced on them for the
  owner too, ADR 0004) and then its `visitor_copies` row. It runs `pnpm db:check-target owner` first,
  like the deploy.
- **Neon's free plan holds 0.5 GB per project.** Slice 2 measures a copy's size
  (`pg_total_relation_size` before and after one) and sets the daily limit so that a month of copies
  at the limit stays under a fifth of it.

### Abuse

- **A global daily limit on new copies,** 200 until slice 2 measures a copy, enforced inside
  `app.claim_visitor_copy`. Beyond it, edits are refused with a message, and reading still works.
- **Per IP, Vercel's firewall, if the Hobby plan allows a rate limit rule** on the Server Action's
  POST. Slice 2 checks that before relying on it. Squadio never stores an IP address: a hash of an
  IPv4 address is reversible, and it would be personal data.

## Alternatives considered

- **The organization id in a signed cookie:** no table, but a leaked or replayed cookie cannot be
  revoked, and the id would travel in every request.
- **Copy on the first visit:** simpler code, but every bot and every reader would cost a copy.
- **Random ids in the copy and a mapping table:** works, but the first save and template links would
  need a lookup the UUIDv5 derivation gives for free.
- **A `SECURITY DEFINER` function that copies the organization:** RLS is forced for the owner too,
  so it would switch contexts exactly as the app does, with SQL that is harder to test than
  TypeScript.
- **A role with `BYPASSRLS` for the copy or the clean-up:** ADR 0004 rules it out without its own ADR,
  and setting the context per organization is enough.
- **A per-IP limit kept in the database:** stores personal data for a weak guarantee, since an
  attacker changes IP more cheaply than a cookie.
- **Saving the whole team instead of changes:** simpler to write, but conflicts and the server-side
  re-check would compare snapshots instead of applying the same changes the client validated.

## Consequences

- The demo can be edited without sign-in, and each visitor's edits survive deploys for 30 days.
- The copy function is the base of v0.5's starting templates: an organization made from a template
  is the same copy with a member instead of a cookie.
- Production now has a cron job and owner credentials used outside deploys; both are in the
  runbook.
- One table and two functions sit outside ADR 0004's rules on purpose, each checked by the guard
  test.
- When sign-in lands, a visitor's copy could be claimed by the new account; v0.5 decides.
- A copy keeps the template it was made from; template changes reach new copies only.

## Amendments to other ADRs

- **ADR 0005:** before sign-in there are two access contexts, the demo template and a visitor's
  copy, both with rate access and both built in `currentAccessContext()`.
- **ADR 0006:** the seed on every deploy replaces the demo template only. Visitors' copies are other
  organizations and are left alone.
