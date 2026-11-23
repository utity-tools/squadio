# 0015. Roles and invitations

- **Status:** accepted
- **Date:** 2026-11-23

## Context

Until v0.5 every organization has one member, its owner, with rate access
([ADR 0012](0012-sign-in-and-membership.md)). v0.5 shares revisions of a scenario
([ADR 0013](0013-scenario-revisions.md)), and a revision is only worth sharing with someone who can
open it: another person of the organization, who may or may not be allowed to see money
([ADR 0005](0005-rate-access-in-the-database.md)). That needs roles, a way to bring a person in, and
a decision on what a share is. The owner decided all three on 2026-11-23, with the plan of v0.5's
slices ([plan](../plan.md#v05-slices)).

## Decision

Three roles, invitations by a link the owner copies, and sharing by an authenticated link only.

### Roles

| Role   | Spanish     | Rate access | Can                                                                                                                                               |
| ------ | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner  | Propietario | Yes         | Everything a member can, plus inviting, changing roles, removing members and deleting the organization. One per organization in v0.5: its creator |
| Member | Miembro     | Yes         | Edit the organization's data and teams, save revisions, share, choose, duplicate and propose alternatives                                         |
| Viewer | Lector      | No          | Read only: projects, scenarios, revisions, the bench and its load, without money. Edits nothing                                                   |

- **Rate access follows the role,** in the one place the access context is built (`capabilitiesFor`
  in `src/lib/membership`). A role it does not know still gets no context at all.
- **A viewer's transactions are read only.** ADR 0005 lets anyone without rate access edit teams,
  since assignments hold no money, and visitors still do. A viewer edits nothing, so the database
  refuses it too: a viewer's context opens its transactions as `READ ONLY`, and the server does not
  offer or accept a write.
- **The browser still cannot change memberships** (ADR 0012): inviting, changing a role and
  removing a member are the owner's Server Actions, checked again inside the transaction.

### Invitations

- **The owner invites by email and role** (member or viewer) from the members page. Squadio makes a
  link to the invitation, which the owner copies and sends by whatever means they choose. Squadio
  sends no email in v0.5 and has no mail provider.
- **It expires 7 days after it is made,** is used once, and the owner can revoke it while it waits.
- **The account that accepts it must have its email.** The invited person signs in with GitHub or
  Google; the provider's email must match the invitation's, ignoring case, or it is refused. A link
  that reaches someone else gives them nothing.
- **Accepting joins the organization with the invitation's role.** An account already in another
  organization then has several, and the organization page lets it pick the active one, the switch
  ADR 0012 left for v0.5.
- **Sign-up still follows its switch** (ADR 0012): with it off, only an account that already exists
  can accept.

### Sharing

- **Link only.** Sharing gives the link of a revision, `/revisions/<id>`, which opens only for
  signed-in members of its organization; for anyone else it does not exist. There are no public
  links and no exported document in v0.5: a file or a public link cannot be taken back, and an
  export is one more way for money to leave the database. An export can come later.
- **A viewer sees the structure and the hours:** the team, who reports to whom, the people, the
  dates, the nominal and effective hours and the load. No rate, cost, price, extra cost, margin,
  effective rate or margin status. The database hides it: a revision's money is in a restricted
  table (ADR 0005), and the page is built without it, as the scenario page is today.

## Alternatives considered

- **Invitations by email:** a provider (Resend's free plan, say) would send them. It needs a domain
  of its own, deliverability, another processor in the owner's processing review, and an email
  Squadio would write about people. A copied link does the job for a handful of colleagues.
- **Public links, or links anyone signed in can open:** whoever is forwarded the link reads the team
  and its people. An authenticated link stops working when the member is removed.
- **An exported document (PDF) for the reviewer:** it cannot be revoked or updated, it carries money
  outside the database's control, and nobody has asked for it yet.
- **Viewers who edit teams:** ADR 0005 would allow it, but a viewer would move costs they cannot
  see. Read only is simpler and can be widened later.
- **Better Auth's default roles (owner, admin, member):** an admin besides the owner is not needed
  yet, and the plugin's roles map to these three in `capabilitiesFor` either way.

## Consequences

- Invited accounts are personal data of more people, under the same processing review as the
  owner's ([plan, service limits](../plan.md#service-limits)).
- A viewer's read only is enforced twice, by the server and by the read-only transaction; rate
  access stays enforced by RLS.
- Removing a member or changing their role takes effect on their next request, since membership is
  resolved on every request (ADR 0012).
- The owner is a single point: ownership cannot be transferred in v0.5, and deleting the owner's
  account still deletes the organizations they are the only owner of (ADR 0012).
- Without email, an invitation's link travels by whatever channel the owner picks; it is useless
  without the invited account, but it should not be posted publicly.

## Amendments

- **2026-11-23, slice 4 (plan):** the owner approved how slice 4 lands, in three pull requests: 4a
  roles and read-only transactions, 4b invitations and the members page, 4c changing a role and
  removing a member ([plan](../plan.md#v05-slices)). What the decision above left open:
  - **The owner stays the owner.** Nobody changes the owner's role, removes the owner or invites
    anyone as owner. The database holds it too: a partial unique index allows one `owner`
    membership per organization. Deleting the owner's account still deletes the organization
    (ADR 0012).
  - **A read-only context is a property of the access context** (`readOnly`), set by
    `memberAccessContext` and `memberEditContext` for a role that does not edit. It opens the
    transaction with `SET TRANSACTION READ ONLY` before the context's settings, so nothing later in
    the transaction can make it read-write again. Every Server Action refuses a viewer first: the
    forms' with their own message, and the scenario page's, which a viewer is never offered, as
    they refuse any scenario the account cannot write. The pages do not offer what a viewer cannot do: the scenario's team is
    locked, as a chosen one is.
  - **Only the owner sees the organization's deletion** on the organization page; any member can
    still delete their own account.
  - **The invitation's link is its id** (`/invitations/<id>`), with no separate token: what protects
    it is the email check. For any account but the invited one, signed out included, the page does
    not exist and names neither the organization nor who invited.
  - **The invited email must be verified** by the provider (`emailVerified`) as well as match.
  - **No second invitation for the same email:** inviting an email with a pending invitation, or of
    a member, is refused, and the page shows the pending one to copy or revoke. An organization
    holds at most 20 pending invitations.
  - **Every member sees the members' names and roles; only the owner sees their emails and the
    invitations.**
  - **Leaving an organization on one's own** is not in v0.5; deleting the account is.
  - **In production, with sign-up off, only an existing account can accept,** and the invitation's
    page says so. The sign-up switch does not change.
- **2026-11-23, slice 4b (invitations):** how invitations and the members page landed.
  - **Squadio writes invitations itself,** with Drizzle, as it writes memberships
    (`src/db/invitations.ts`, `src/db/accept-invitation.ts`), never through the organization
    plugin: its permissions are not `capabilitiesFor`'s, and it cannot run inside Squadio's
    transactions, so neither the limit of 20 nor using an invitation once would hold. Every one
    of the plugin's endpoints is disabled, read from the plugin so an upgrade's new one is too:
    its reads (`get-full-organization`, `list-members`) would show any member the invitations and
    the emails. Its `invitationLimit: 0` and `membershipLimit: 1` stay as a second guard, and a
    database test checks every endpoint answers 404. The rules themselves are pure
    (`src/lib/invitations/rules.ts`).
  - **The database holds an invitation to its rules too** (migration 0014): its role is `member`
    or `viewer` and always set, its status `pending`, `accepted` or `canceled` (expiring is a
    matter of `expires_at`, not stored), its email trimmed and in lower case, and an organization
    holds one pending invitation per email (`invitation_one_pending_per_email`). Inviting first
    cancels the organization's expired pending invitations, so they neither block their email nor
    count towards the limit.
  - **Every write locks the organization first,** then checks the owner again (inviting,
    revoking) or locks the invitation (accepting), in deleting's order, so none deadlocks: two
    invitations at once take turns for the last place, and the second of two acceptances finds
    the invitation used.
  - **The members page is `/organization/members`,** linked from the organization page. For
    anyone but the owner, emails and invitations are not even read.
  - **Signed out, an invitation's page not found offers «Entrar»** while accounts are open, as
    the account corner does, the same for every id, so a link opened first still leads in
    without telling that it exists. Only `/invitations/<id>` has this page not found of its own:
    the app's stays static, since one that reads the request loses the title its page sets. The
    sign-in page comes back only to an invitation's page on this origin
    (`src/lib/invitations/return-path.ts`), never to any other path it is given.
  - **The sign-up notice sits by the link, for the owner:** only the invited account reaches the
    invitation's page, and it exists already, so the members page says that, while sign-up is
    off, only an existing account can accept. It replaces "the invitation's page says so" above.
  - **The organization page lists the account's organizations** when it has several, beside the
    top bar's switcher; accepting makes the new one the session's active organization.
  - **The invited account cannot decline:** an invitation it does not accept expires.
  - **Left open:** with sign-up off the sign-in page offers no provider, to existing accounts
    either, so in production only an account already signed in can accept until signing in is
    opened to existing accounts.
- **2026-11-23, slice 4c (roles and removal):** how changing a role and removing a member landed.
  - **Squadio writes both itself** (`src/db/memberships.ts`), as it writes invitations, never
    through the organization plugin, whose endpoints stay disabled. Both lock the organization
    first and check the owner again (`src/db/owner.ts`, which inviting and revoking share), then
    lock the membership, in deleting's order, so none deadlocks: two removals at once remove once,
    and a removal next to the organization's deletion either removes first or finds no owner.
  - **Only a member's or a viewer's membership is ever found.** The owner's, another
    organization's, one with a role Squadio does not know and a malformed id all answer "not
    found", so nobody changes or removes the owner, the owner included; the partial unique index
    stays as the second guard. The owner gives a member or a viewer the other role, and giving the
    role it already has changes nothing.
  - **Removing deletes only the membership.** The account stays, with its other organizations, and
    so does its revisions' authorship: the author is the account (ADR 0013), not the membership,
    so a removed member's revisions still show their name. Their sessions that worked in the
    organization lose it as their active organization: `memberOf` refuses an active organization
    that is not the account's, so without this a removed member would reach none of their
    organizations; with it the next request acts in their earliest one, or in none. A save of
    theirs already under way still finishes; the change counts from the next request.
  - **The members page offers both to the owner,** on every row but the owner's: one button for
    the other role, which keeps the focus and is announced, and «Quitar…», behind a confirmation
    window that says what stays and starts on Cancel. After a removal the list's heading takes the
    focus. Every other member sees the list as before, with nothing to change.
  - **A removed member can be invited again,** as anyone who is not a member can.
  - **No CHECK on a membership's role yet:** nothing writes a role but `owner`, `member` and
    `viewer`, and `capabilitiesFor` gives an unknown one no context; it can come with the next
    migration that touches `auth.member`.
