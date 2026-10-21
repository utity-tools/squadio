# 0002. Cost model: costs per category, effective hours

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Squadio's value is a credible answer to "what does this team cost and what margin do we keep?".
People who staff projects for a living spot a toy model at once: summing salaries ignores employer
costs, part-time allocation, open roles, holidays and how fixed-price and T&M projects differ.
At the same time the app must not expose individual salaries.

## Decision

Follow the model in [`docs/domain.md`](../domain.md):

- **Costs live on categories, not on people.** Each category has a cost per hour, derived from a
  fully loaded annual cost and net annual hours, and a sell rate. People only have a category, so
  open roles cost the same as named people and no salary is stored per person.
- **Effective hours.** Cost per hour is loaded with non-working time, so assignment hours are
  multiplied by an availability factor (net annual hours / calendar working hours). A full year at
  100% then costs exactly the fully loaded annual cost.
- **One margin formula for both pricing models.** Fixed price and T&M differ only in where revenue
  comes from. Margin % is always over revenue.
- **Overhead on staff cost, buffer on direct cost plus overhead**, both set per organization and
  overridable per project.
- **Everything is configurable per organization**, starting from a template (Consultancy, Startup,
  Design agency).
- **Money in integer cents**, rounded once per result line.

## Alternatives considered

- **Cost per person:** more precise for people far from their category's average, but it stores
  individual salaries and cannot price open roles. A hidden per-person adjustment can come later
  without changing the model.
- **Calendar hours times loaded cost per hour:** simple, but it counts holidays twice and overstates
  long assignments by up to about 28%.
- **Tracking real absences per person:** more precise for short projects, but it needs data nobody
  keeps up to date and does not work for open roles.

## Consequences

- The costing engine is pure and fully testable; the guide case and the invariants in
  `docs/domain.md` are its first tests.
- A category with very few people still reveals an approximate salary; the app warns about it.
- When rates change, chosen scenarios keep the rates they were chosen with.
- Short projects with no holidays in them are slightly underestimated; the availability factor is an
  average.

## Amendments

- **2026-10-21:** choosing a scenario also freezes its overhead %, buffer % and availability factor
  ([domain rule b](../domain.md#rules)), and the money representation is set in
  [ADR 0010](0010-money-in-postgres.md): euros in `numeric(12,2)`, integer cents in TypeScript.
