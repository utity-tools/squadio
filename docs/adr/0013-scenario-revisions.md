# 0013. Scenario revisions

- **Status:** accepted
- **Date:** 2026-11-23 (requirements written on 2026-10-29)

## Context

v0.5 lets someone share a scenario with a reviewer, who may send back an alternative, and lets the
organization choose ([plan](../plan.md#roadmap)). All three need to point at something that does not
change while people talk about it. Today nothing does:

- **A scenario changes in place.** Its `version` only detects concurrent saves; no earlier state is
  kept, and the undo history lives in the page's memory.
- **Choosing keeps part of the inputs.** It freezes rates, overhead, buffer and the availability
  factor ([what choosing freezes](../domain.md#what-choosing-freezes)), but not the project's price
  or planned period, the extra costs or the calendar, so a chosen scenario's result can still move;
  unchoosing deletes what was frozen.

The owner's UX review (private `utity-tools/squadio-research`, commit `24b53fd`) asks that a shared
link always opens what was sent, that a reviewer's changes never overwrite the author's, and that a
past decision can be read as it was taken. This ADR first recorded those requirements; the owner
decided the design on 2026-11-23, with the plan of v0.5's slices ([plan](../plan.md#v05-slices)).

## Requirements

- **A revision never changes.** It holds what its result needs: the team, the dates, the project's
  conditions and pricing, the extra costs, the inputs the engine used and its result, and which
  version of the costing rules produced it.
- **Money stays restricted.** A revision's rates, costs and margins are readable only with rate
  access, as ADR 0005 requires today. Nothing about money may leak through a summary, a comparison,
  a difference between revisions, a notification or an export.
- **A shared link opens one revision,** and says when a newer one exists.
- **Proposing changes makes a derived alternative,** with where it came from and who made it, and
  never touches the revision it started from.
- **Choosing points at a revision.** Choosing an old one checks what changed since (capacity, rates,
  the project's conditions) and says so first.
- **A revision records what was known, not what is true now:** it can keep the load observed that day,
  which says nothing about whether those people are still free when someone chooses it.

## Decision

A revision is **one immutable snapshot of a scenario, split in two rows**: an open one everyone in
the organization reads and a restricted one only rate access reads. Shares and choices point at a
revision, never at the scenario, and choosing replaces the frozen tables. The domain says what a
revision holds and when one is made ([revisions](../domain.md#revisions)); this ADR records why.

- **Shape: a snapshot, not copied rows.** Each revision stores its inputs and its result as JSON,
  validated by a Zod schema that carries a schema version. A row once written is never updated (the
  app role has no UPDATE on either table): a
  new schema version reads the old ones as they are, and no migration rewrites them.
- **Split: two tables.** `scenario_revision` holds the open part: the team (categories, people,
  project roles, who reports to whom, weekly hours, allocation and dates), each assignment's
  nominal and effective hours, the scenario's name, the project's pricing model and the
  over-allocation observed that day. `scenario_revision_money` holds the restricted part, one row
  per revision: the rates of the categories it uses, the overhead %, buffer % and both terms of the
  availability factor, the project's price and planned period, the extra costs and every result
  line. The money table uses ADR 0005's restricted policy and is on the guard test's list. Effective
  hours are in the open part, so everyone reads the same hours for a revision.
- **Rules version: a number and a commit.** The costing rules carry an integer version, written in
  [domain.md](../domain.md#revisions) and kept as a constant in code; a test keeps the two equal. Each
  revision stores it, and the commit SHA of the build that made it for traceability only. A revision
  shows its stored result and is never recalculated with newer rules.
- **Choosing points at a revision** and replaces FrozenRate and FrozenCostConfig. Choosing a
  scenario chooses its latest revision, made first if the scenario has none that matches it.
  Unchoosing removes the pointer only: the revision stays. Target margin stays out of the revision:
  a revision's margin status is judged against the organization's current target, as today.
- **Migration from what is frozen today.** Slice 6 makes a revision for every chosen scenario from
  its existing FrozenRates and FrozenCostConfig, never from the current rates, together with the
  team, price, planned period and extra costs it is costed with today, so no chosen result moves.
  A chosen scenario without frozen rows (skipped by migration 0007's backfill) gets its revision
  from the current values it is costed with today, for the same reason. A later migration drops
  FrozenRate and FrozenCostConfig, once the revisions are in production.
- **When a revision is made:** when someone with rate access asks for it («Guardar revisión»), and
  automatically when a scenario is shared or chosen. Never on a save or an autosave. Each takes
  the scenario as saved; when nothing differs from its latest revision, that one is used again and
  no new one is made. The load observed is not compared, since it comes from other projects: a
  revision records what was known when it was made.
- **Retention:** a revision lives as long as its scenario. Deleting the scenario, its project or
  the organization deletes its revisions. Deleting an account leaves its revisions without an
  author, shown as «antiguo miembro». No revision is deleted on its own in v0.5.
- **Derived alternative.** «Proponer alternativa» on a revision makes a new draft scenario of the
  same project from that revision's team and extra costs, recording the revision it came from and
  who made it. The revision and its scenario never change. It needs rate access, like duplicating.
  If the revision is deleted with its scenario, the alternative's link to it is cleared and it
  says it came from a deleted revision.
- **A link opens one revision:** `/revisions/<id>`, for signed-in members of its organization only.
  There are no public links. The page says when the scenario has a newer revision.
- **Choosing an old revision lists what changed since** (the team saved since, people's load, the
  rates, the project's conditions and the rules version) and asks to confirm first.
- **Demo:** the seed writes one revision and one derived alternative to show them. Visitors cannot
  share, since a link opens only for signed-in members.

Roles and invitations, which sharing needs, are [ADR 0015](0015-roles-and-invitations.md).

## Alternatives considered

- **Rows copied on write:** a revision copies the scenario's assignments and extra costs into
  mirror tables, and each restricted table gets a frozen twin. Every schema change would happen
  twice, every mirror needs RLS, composite keys and immutability of its own, and a new input could
  be forgotten in a mirror without anything failing. A snapshot is one pair of rows per revision,
  and its Zod schema lists everything the result needs in one place.
- **Building on the frozen tables:** keep FrozenRate and FrozenCostConfig and add the rest next to
  them. That leaves two sources of truth for a chosen scenario's inputs, and the project's price
  and planned period, the extra costs and the calendar would still move a chosen result unless
  they got frozen tables too, which is the copied-rows option again.
- **A revision on every save:** autosave would make hundreds per scenario that nobody shared or
  chose, and an author could not tell which one they meant to send.
- **Recalculating old revisions with current rules:** a decision taken under rules version 1 would
  show a different result after a change of rules, which is what a revision exists to prevent.
- **Public links:** anyone holding the link would read the team and, with it, the people. A link
  for signed-in members can be revoked by removing the member
  ([ADR 0015](0015-roles-and-invitations.md)).

## Consequences

- From slice 6 a chosen scenario is a record of its result: its price, period, extra costs and
  hours no longer move it. Until then it keeps exactly today's guarantees, and the UI calls it
  chosen, never frozen or approved as a whole ([plan, service limits](../plan.md#service-limits)).
  Formal approval stays a non-goal.
- Money inside JSON hides from the guard test, which finds money by its `numeric` type
  ([ADR 0010](0010-money-in-postgres.md)). It is held only in `scenario_revision_money`, in integer
  cents and basis points as in TypeScript. The open part's Zod schema is strict and has no money
  field, and a test checks that an open part built with rate access holds no money.
- Every schema version stays readable for as long as revisions of it exist.
- The existence of a revision, its number, date and author are open, so someone without rate access
  can tell that a newer revision exists even when only money changed. Neither the banner nor the list
  says what changed; this much is accepted.
- A change of rules that moves a result for the same inputs must move the rules version on. One
  test keeps the two numbers equal; another pins the worked examples' results with the version, so
  a moved result without a new version fails, and the review (`domain-guardian`) catches the rest.
- Only revisions of the current rules version can be recalculated, since the code keeps only the
  current rules; older ones are shown as stored.
- A revision keeps people's and categories' names as they were. Squadio does not delete people
  yet, only deactivates them; when it does, erasing a person must reach their revisions too.
- A visitor's copy must copy the template's revisions with new ids, since a chosen scenario points
  at one ([ADR 0011](0011-saving-edits-and-the-visitor-copy.md)).
- Weekly load, Inicio and the comparison read a chosen scenario's chosen revision from slice 6, not
  its saved team and current values.
