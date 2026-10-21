# Domain: the cost model

How Squadio turns a scenario into cost, revenue and margin. This file is the specification: change
it first, then the code. Terms are defined in the [glossary](glossary.md); the reasoning behind the
model is in [ADR 0002](adr/0002-cost-model.md).

## The calculation

All of it is one pure function per scenario in `src/lib/costing`,
`calculateScenario(scenario, rates, costConfig, targetMargin)`. It saves nothing: it returns the
result and the UI renders it.

- `rates` are a cost per hour and a sell rate per category. For a scenario that is not chosen they
  come from the current CategoryRates (cost per hour derived with Config's net annual hours, or set
  manually); for a chosen scenario they are its FrozenRates.
- `costConfig` holds the overhead %, the buffer % and the availability factor. For a scenario that
  is not chosen they come from the current CostConfig (or the project's overrides in
  ProjectPricing) and Config; for a chosen scenario they are its FrozenCostConfig.
- `targetMargin` always comes from the current CostConfig: it is never frozen (rule b).

Current and frozen inputs have the same shape, so the engine does not know whether a scenario is
chosen.

## Entities

Every entity but Organization belongs to one organization and carries its `organization_id`; the
database keeps organizations apart ([ADR 0004](adr/0004-tenant-isolation-with-rls.md)). Money lives
only in the entities marked **Restricted**, which users without rate access cannot read at all
([ADR 0005](adr/0005-rate-access-in-the-database.md)): the rest describe structure and hours.

| Entity           | Key fields                                                                                                                                     | Notes                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Organization     | id, name, starting template                                                                                                                    | The tenant                                                                                     |
| Config           | net annual hours (1,550), default weekly hours (40)                                                                                            | One per organization. The holiday calendar is the national one in v1, a code constant (rule h) |
| CostConfig       | overhead %, buffer %, target margin %                                                                                                          | One per organization. Restricted                                                               |
| Category         | id, name                                                                                                                                       | Its money lives in CategoryRate                                                                |
| CategoryRate     | category, gross annual salary (or monthly × number of payments), social security % (31%), other yearly costs, manual cost per hour?, sell rate | One per category. Restricted. Cost per hour is derived unless set manually                     |
| Person           | id, name, category, weekly hours, area?, active                                                                                                | No individual salary                                                                           |
| Project          | id, name, client, pricing model (fixed or T&M)                                                                                                 | Its money lives in ProjectPricing                                                              |
| ProjectPricing   | project, price, overhead %?, buffer %?                                                                                                         | One per project. Restricted. Empty overrides fall back to CostConfig                           |
| Scenario         | id, project, name, chosen, version                                                                                                             | `version` provides optimistic locking                                                          |
| FrozenRate       | scenario, category, cost per hour, sell rate                                                                                                   | Written when a scenario is chosen (rule b). Restricted                                         |
| FrozenCostConfig | scenario, overhead %, buffer %, net annual hours, calendar working hours                                                                       | One per chosen scenario, written with its FrozenRates (rule b). Restricted                     |
| Assignment       | id, scenario, category, person?, project role, reports to?, weekly hours, allocation %, start date, end date                                   | No person = open role. `reports to` builds the team tree                                       |
| ExtraCost        | id, scenario, label, kind (fixed, recurring, percentage), amount, base (staff cost or revenue), dates?                                         | Belongs to the scenario: another team may need different infrastructure. Restricted            |

## Formulas

Cost per hour of a category:

```math
\text{costPerHour} = \frac{\text{grossSalary} \times (1 + \text{socialSecurity}) + \text{otherCosts}}{\text{netAnnualHours}}
```

Availability factor, derived from Config and the calendar, never typed in:

```math
\text{availability} = \frac{\text{netAnnualHours}}{\text{calendarWorkingHours}} \approx 0.78
```

Hours of an assignment:

```math
\text{nominalHours} = \text{workingDays}(\text{start}, \text{end}) \times \frac{\text{weeklyHours}}{5} \times \text{allocation}
```

```math
\text{effectiveHours} = \text{nominalHours} \times \text{availability}
```

Cost:

```math
\text{staffCost} = \sum \text{effectiveHours} \times \text{costPerHour}_{\text{category}}
```

```math
\text{directCost} = \text{staffCost} + \text{extraCosts}
```

```math
\text{overhead} = \text{overhead\%} \times \text{staffCost}
```

```math
\text{buffer} = \text{buffer\%} \times (\text{directCost} + \text{overhead})
```

```math
\text{totalCost} = \text{directCost} + \text{overhead} + \text{buffer}
```

Revenue and margin:

- **Revenue:** fixed price = the price. T&M = Σ effective hours × the category's sell rate.
- **Direct margin** = revenue − direct cost. **Net margin** = revenue − total cost.
- **Margin %** = margin / revenue, always over revenue.
- **Effective rate** = revenue / Σ effective hours.

The UI shows both nominal hours (to plan) and effective hours (for cost and billing).

### Why effective hours

Cost per hour is loaded: it divides a year's cost by net hours, which already exclude holidays,
leave and training. Multiplying it by calendar hours would count that time twice and overstate the
cost of long assignments by up to about 28%. Applying the availability factor to the hours makes a
full year at 100% cost exactly the fully loaded annual cost (see the first invariant below).

## Rules

| #   | Topic                 | Rule                                                                                                                                                                                                                                                                |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Weekly hours          | Stored on the assignment: copied from the person, or from Config for an open role                                                                                                                                                                                   |
| b   | Rate changes          | Choosing a scenario freezes its category rates (FrozenRate) and its overhead %, buffer % and availability factor (FrozenCostConfig). Target margin is not frozen. Other scenarios always use current values. See [What choosing freezes](#what-choosing-freezes)    |
| c   | Over-allocation       | Per person and week: chosen scenarios of other projects plus the scenario being edited. Never two scenarios of the same project                                                                                                                                     |
| d   | Recurring extra costs | Prorated by day. Without dates they span the project, from the first assignment start to the last end                                                                                                                                                               |
| e   | Price in T&M          | An optional budget cap with a warning. Percentages "over price" use the calculated revenue                                                                                                                                                                          |
| f   | Margin %              | Over revenue                                                                                                                                                                                                                                                        |
| g   | Money                 | Euros in `numeric(12,2)` in Postgres, integer cents in TypeScript; money-bearing percentages in `numeric(5,2)`, basis points in TypeScript; allocation an integer from 0 to 100 ([ADR 0010](adr/0010-money-in-postgres.md)). Rounded once per result line, EUR only |
| h   | Holidays              | One national calendar in v1, kept as a constant in code, not in the database; a known limitation. Changing it changes the working days of every assignment, chosen or not                                                                                           |
| i   | Chosen scenario       | At most one per project, enforced by a partial unique index                                                                                                                                                                                                         |
| j   | Salary leaks          | Without rate access, no costs or margins: restricted entities return no rows (ADR 0005). A warning when a category has fewer than 3 people, since its cost reveals a salary                                                                                         |
| k   | Missing rate          | A category without a rate makes its scenarios incomplete: they show a warning and no cost, never a cost of 0                                                                                                                                                        |

### What choosing freezes

A chosen scenario is a commitment: its cost must not move because someone edits the organization's
settings later. Choosing it copies, in one transaction, everything its cost depends on that lives
outside the scenario:

- **Category rates** (FrozenRate): the cost per hour and sell rate of each category it uses.
- **Overhead % and buffer %** (FrozenCostConfig): the values in effect when it is chosen, the
  project's overrides or else the organization's CostConfig.
- **The availability factor** (FrozenCostConfig). It comes from Config (net annual hours and the
  holiday calendar) and multiplies every assignment's hours, so without freezing it, changing net
  annual hours would change the cost of every chosen scenario. It is stored as its two terms, net
  annual hours and calendar working hours, so the frozen factor is exactly the one the scenario was
  costed with, with no rounding.

**Target margin is not frozen.** It is a goal, not a cost: a chosen scenario's margin stays the
same, and its green, amber or red status is judged against the organization's current target.

## Configuration per organization

Each organization creates its own categories and sets every number. A salary can be entered per year
or per month with the number of payments (2,100 €/month × 14 = 29,400 €/year). On sign-up the
organization picks a starting template (Consultancy, Startup, Design agency) and edits it.

The Consultancy template, also used by the demo (Madrid, 2026, indicative):

| Category           | Gross annual | Fully loaded | Cost per hour | Sell rate per hour |
| ------------------ | -----------: | -----------: | ------------: | -----------------: |
| Senior Developer   |     52,000 € |     71,120 € |       45.88 € |               65 € |
| Junior Developer   |     27,000 € |     38,370 € |       24.75 € |               35 € |
| Frontend Developer |     42,000 € |     58,020 € |       37.43 € |               52 € |
| DevOps Engineer    |     50,000 € |     68,500 € |       44.19 € |               62 € |
| Project Manager    |     55,000 € |     75,050 € |       48.42 € |               70 € |

Template values: social security 31%, other costs 3,000 € a year, 1,550 net hours, overhead 15%,
buffer 10%, target margin 25%.

## Guide case

The first test of the costing engine. Fixed price of 200,000 € over 26 weeks: Senior Developer at
100%, Frontend Developer at 100%, DevOps Engineer at 50%, Project Manager at 50%, and cloud at
1,000 € a month. Figures are rounded here; the test pins the exact values.

| Line                                 |                  Amount |
| ------------------------------------ | ----------------------: |
| Staff cost (2,437.5 effective hours) |               105,312 € |
| Cloud                                |                 6,000 € |
| Direct cost                          |               111,312 € |
| Overhead                             |                15,797 € |
| Buffer                               |                12,711 € |
| Total cost                           |               139,820 € |
| Direct margin                        |        88,688 € (44.3%) |
| Net margin                           | 60,180 € (30.1%), green |
| Effective rate                       |               82.05 €/h |

For reference, the same team billed as T&M would bring 148,688 €.

## Invariants

Property-based tests (fast-check) check these on random scenarios:

- A full year at 100% costs exactly the category's fully loaded annual cost.
- Adding an assignment never lowers the cost.
- With a fixed price, more cost always means less margin.
- The `reports to` tree never has cycles.
- With more than zero hours, the effective rate is positive.

## Out of scope for v1

Productivity by seniority and cost per deliverable, real availability and skills beyond
over-allocation, schedule effects (more people do not always finish sooner), and a hidden per-person
cost adjustment. The model can take each of them by adding a field.
