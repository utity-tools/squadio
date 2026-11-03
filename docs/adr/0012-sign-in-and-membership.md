# 0012. Sign-in and membership

- **Status:** accepted
- **Date:** 2026-10-29

## Context

Until now production has served two access contexts, the demo template and a visitor's anonymous
copy of it, both with synthetic data ([ADR 0011](0011-saving-edits-and-the-visitor-copy.md)).
Sign-in was planned for v0.5.

On 2026-10-29 the owner planned the roadmap again after a UX review
([plan](../plan.md#roadmap); the review is in the private `utity-tools/squadio-research`, commit
`24b53fd`). v0.3 is now the first version for real use: someone signs in, creates an organization
and prepares a project with its own categories, costs and people. Two options were weighed:

1. Keep v0.3 an editable demo with synthetic data and open roles, and bring sign-in later.
2. Bring a minimal sign-in into v0.3, so the organization's own data belongs to an account.

The owner chose option 2. Without accounts, real names of a company's staff would sit in an
anonymous copy found through a cookie; aliases do not fix that, since a pseudonym of a real person
is still personal data. Accounts do not make the service compliant by themselves either, which is
why sign-up stays off in production until the owner has reviewed how the data is processed
([plan, service limits](../plan.md#service-limits)).

What already holds and constrains the design:

- [ADR 0001](0001-stack-and-workflow.md) chose Better Auth with its organizations plugin.
- [ADR 0004](0004-tenant-isolation-with-rls.md): RLS separates organizations by
  `app.organization_id`, set by `withOrganization`; its tables for Better Auth were left open.
- [ADR 0005](0005-rate-access-in-the-database.md): rate access is set with the organization in
  one access context, built in one place, meant to come from the signed-in member's role.

## Decision

Accounts sign in with GitHub or Google through Better Auth. The server finds the account's
membership in the organization and builds the access context from it before any tenant query.

### Sign-in

- **OAuth only, GitHub and Google.** No passwords and no email sent by Squadio, so there is no
  password store, reset flow or mail provider to run. Microsoft waits until interviews ask for it:
  its multi-tenant setup is the most delicate of the three.
- **An account holds what the provider returns and Better Auth needs:** name, email and avatar URL,
  plus sessions. Nothing else is asked.
- **A sign-up switch,** a server env var read from `@/env`, off unless set. Off, the sign-in
  buttons are not shown and Better Auth refuses to create a user, so a deploy from `main` cannot
  open sign-up by accident. It is on in development and previews, and off in production until the
  owner has done the processing review and turns it on.

### Membership and the access context

- **The server resolves user → member → organization → capabilities,** from the session, and only
  then calls `withOrganization`. An organization id from the browser (a URL, a form field, a cookie)
  is at most a choice among the account's memberships, checked on the server, never authority on its
  own.
- **RLS does not change.** ADR 0004's policy still keeps organizations apart and ADR 0005's still
  hides money; membership decides which context the server sets, and the database still refuses
  what the context does not allow.
- **One role in v0.3: owner.** v0.3 has no invitations, so every organization has one member, its
  creator, with rate access, editing and choosing. Roles without rate access are planned with
  invitations (v0.5; still proposed in the [plan](../plan.md#accepted-and-proposed)), and would map
  to ADR 0005's rate access in the same place the context is built.
- **Members write with their own context.** ADR 0011's saves run without rate access because a
  visitor only edits teams. A member also writes categories' costs (slice 3), which are restricted,
  so a member's edit context carries the member's rate access.
- **Anonymous visitors are unchanged.** Without a session the demo template and the visitor's copy
  work as before. A signed-in account that opens the demo sees it as a visitor does, cookie and copy
  included: the demo never becomes part of an organization except by adopting a copy.

### Starting an organization

- **Empty,** with the Consultancy template's Config and CostConfig and no categories, people or
  projects.
- **Or by adopting the visitor's copy,** an explicit action ("Create a new organization with this
  example and my changes"), never a side effect of signing up. The copy adopted is the one the
  cookie's token resolves to on the server, never an id the browser sends. It becomes the member's
  new organization, keeps its synthetic data, and leaves `visitor_copies`, so the clean-up of idle
  copies no longer touches it; the cookie is cleared. `squadio_app` has no privilege on
  `visitor_copies`, so releasing the claim takes a third `SECURITY DEFINER` function next to ADR
  0011's two, which looks it up by the token's hash and which the guard test allows. The copy is
  never merged into an organization the account already has.

### Deleting

- **The owner can delete the organization:** every tenant row, inside its own context, and its
  members.
- **An account can be deleted:** its sessions, provider links and memberships, and the organizations
  it was the only owner of.
- **Nothing is promised beyond what the system does.** Whether and for how long Neon's history or
  backups keep deleted rows is part of the owner's processing review, and the privacy page says what
  it finds, not more.

### Tests

- DB tests prove that a member of one organization can neither read nor write another's rows, through
  every path that builds a context, and that rate access follows the member.
- A test proves that with the switch off no account can be created.

### Left to slice 2

Decided when the code lands, as amendments here (settled on 2026-11-03, see
[Amendments](#amendments)):

- Where Better Auth's tables live (a schema of their own or `public`), which role reads them, and
  how they fit ADR 0004's guard test, since some have no `organization_id` and some are read across
  organizations.
- Whether tenant tables gain a foreign key to the organization table now that it exists.
- How an adopted organization shows that its data is the demo's example, not the organization's
  own: on which rows, and what the UI does with it.
- How the active organization is kept for an account with several.

## Alternatives considered

- **A demo-only v0.3 (option 1):** smaller, but a second demo release, and nothing for real use
  until v0.5.
- **Aliases instead of names before sign-in:** a pseudonym of a real person is still personal data,
  so it changes nothing about who is responsible for it.
- **Email magic links:** a mail provider, deliverability and more personal data to run, for no gain
  over OAuth with the providers managers already use.
- **Passwords:** a credential store and its whole security burden.
- **A hosted identity provider (Clerk, Auth0):** another processor of personal data, and ADR 0001
  already chose Better Auth.
- **Adopting by merging the copy into an existing organization:** mixes synthetic and real data and
  needs rules for every collision.

## Consequences

- Squadio starts holding personal data: the accounts' and, from slice 3, the staff names an
  organization enters. The processing review gates v0.3.0, and the README states the service's limits
  rather than compliance.
- The Organization table arrives in v0.3, two versions earlier than planned.
- The access context gains a third source, the member, next to the template and the copy.
- Invitations, roles without rate access and sharing stay in v0.5.

## Amendments to other ADRs

- **ADR 0004:** Better Auth's tables are settled by this ADR's slice 2, in v0.3.
- **ADR 0005:** the access context comes from the member from v0.3; until invitations, the only
  member is an owner with rate access.
- **ADR 0011:** a signed-in visitor may adopt their copy as a new organization, which takes it out
  of the clean-up.

## Amendments

- **2026-11-03, slice 2 (sign-in base):** the open points of "Left to slice 2", and how previews
  sign in.
  - **Better Auth's tables live in a schema of their own, `auth`** (migration 0008): its core
    tables, the organization plugin's `organization`, `member` and `invitation`, and the rate limit,
    which counts in the database because serverless instances share no memory. The app role reads
    and writes them and cannot create objects there. They have no RLS: accounts, sessions and
    memberships are read across organizations, and membership decides which context the server
    sets. ADR 0004's guard treats `auth` as a schema of accounts, so its tables need no tenant
    policy while its money and view checks still apply. Ids are uuids, so an organization's id fits
    the tenant tables' `organization_id`.
  - **Tenant tables gain a foreign key to `auth.organization`** in the next slice, with an
    organization row for the demo and for each visitor's copy.
  - **An adopted organization is flagged as the demo's example at the organization level,** and
    the UI shows a banner while the flag is set.
  - **The active organization is kept in the session** (the organization plugin's
    `active_organization_id`), checked on the server against the account's memberships on every
    request. URLs do not carry it.
  - **The organization plugin is limited to v0.3's model:** the browser cannot create, change or
    delete organizations (the server creates them in slice 2b and deletes them with their data in
    slice 2d), an organization has at most one member and no invitations. The plugin refuses to
    start without its `invitation` table, which stays empty.
  - **Previews sign in through production with Better Auth's OAuth proxy.** GitHub and Google
    know one callback per provider, production's, and a preview's address changes with every pull
    request. A preview sends the provider to production's callback; production exchanges the code,
    writes nothing, and sends the profile back to the preview's own alias encrypted with
    `OAUTH_PROXY_SECRET`, which only production and the previews hold; the preview creates the
    account in its own branch database. No other origin is trusted: the preview names its alias
    itself, never from the request. Whoever holds the secret can forge a profile, so only previews
    serve the endpoint that completes a proxied sign-in: production serves none, and a forged
    profile signs no one in there. On a preview it can, and only this repository's branches get
    previews. So production holds GitHub and Google OAuth apps before the processing review. Sign-up
    stays off there, which refuses every new account through a database hook and sends the person
    back to the sign-in page, and Google's consent screen stays in testing with the owner as its
    only test user, so the providers process no one else's data until the review. A preview cannot
    sign in until production runs the same Better Auth version with the proxy, so the slice that
    brings it is checked on the next pull request's preview, and Better Auth is pinned to an exact
    version that production and previews upgrade together.
  - **Accounts keep no provider token:** Squadio never calls GitHub's or Google's APIs, so a
    database hook drops the tokens before they are stored (and Better Auth would encrypt any that
    got through). An account keeps a name, an email, the link to a profile picture and the
    provider's id; each session, the IP address and browser it was started from. The sign-in page
    says so.
  - **The auth variables are read at run time only,** so builds still hold no secret; in Vercel
    they can be **Sensitive**, unlike `DATABASE_URL`
    ([ADR 0006](0006-deploys-from-github-actions.md)).
  - Telemetry is off.
- **2026-11-03, slice 2b (organizations and membership):** how the server creates organizations
  and resolves the member.
  - **Every `organization_id` references `auth.organization`** (migration 0009), the tenant tables'
    and `visitor_copies'`, **without a cascade**: Postgres runs cascades without RLS (ADR 0005), so
    deleting an organization means deleting its rows first, inside its own context (slice 2d), and
    a delete that forgets one fails. The migration backfills a row for the demo, every visitor's
    copy and any other organization with rows; to see those it lifts FORCE ROW LEVEL SECURITY for
    its own reads and restores it in the same transaction, and the guard test checks every tenant
    table is forced. The seed writes the demo's row, a visitor's first write its copy's, and the
    clean-up deletes it last. Better Auth's slug is derived from the id; Squadio never shows it.
  - **The example flag is a column,** `auth.organization.example`, which Better Auth does not know.
    The organization page shows a banner while it is set.
  - **The server writes organizations and memberships itself,** with Drizzle, in one transaction
    (`src/db/start-organization.ts`): the organization's row, its owner's membership, its tenant
    rows and the session's active organization. An empty one gets the Consultancy template's
    Config and CostConfig (`src/lib/organizations/consultancy.ts`), which the demo seed uses too.
    Adopting renames the copy, flags it and calls `app.release_visitor_copy` (migration 0010),
    which locks the claim before any other row, in the save's and the clean-up's order. A DB test
    lists it with ADR 0011's two as the only `SECURITY DEFINER` functions.
  - **The browser cannot change memberships either:** the organization plugin also refuses
    leaving, removing a member and changing a member's role, since rate access follows the role.
  - **Membership is resolved in `src/db/access.ts`:** `memberOf` reads the session's active
    organization and accepts it only among the account's memberships; without one it takes the
    earliest. `capabilitiesFor` (`src/lib/membership`) maps the owner to rate access, editing and
    choosing, and any other role to no member at all. `memberAccessContext` and
    `memberEditContext` build the member's contexts.
  - **The scenario id picks the context, never grants it.** The scenario page and its Server
    Actions act in the member's organization when it holds the scenario, and as a visitor
    otherwise (`src/db/scenario-writes.ts`), so the demo stays a visitor's for a signed-in
    account. A member's choice needs the member's rate access and the page's.
  - **The organization page** (`/organization`) shows the member's organization, or, to an
    account without one, the two ways to start it; sign-in lands there. An account with several,
    which only the server makes today, works in its active one; a way to switch waits for
    invitations (v0.5).
