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
