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

Decided when the code lands, as amendments here:

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
