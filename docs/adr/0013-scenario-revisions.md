# 0013. Scenario revisions

- **Status:** proposed
- **Date:** 2026-10-29

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
past decision can be read as it was taken. This ADR records the requirements and the open questions.
It decides no design yet: that happens before v0.5, and this ADR is then accepted or replaced.

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

Not decided. Open questions for v0.5:

- Which shape: a snapshot of the inputs and result per revision, rows copied on write, or another.
- How restricted and open parts of a revision are split across tables, given ADR 0005.
- What "version of the rules" is: a number in `domain.md`, the engine's code version, or both.
- Whether choosing replaces FrozenRate and FrozenCostConfig or is built on them.
- When a revision is made: on every share, on request, or on every save.
- How long revisions are kept, and what deleting an organization or an account does to them
  ([ADR 0012](0012-sign-in-and-membership.md)).

## Alternatives considered

To be written with the decision.

## Consequences

Until this ADR is accepted, a chosen scenario keeps exactly today's guarantees and the UI calls it
chosen, never frozen or approved as a whole ([plan, service limits](../plan.md#service-limits)).
