# Domain: the cost model

How Squadio turns a scenario into cost, revenue and margin. This file is the specification: change
it first, then the code. Terms are defined in the [glossary](glossary.md); the reasoning behind the
model is in [ADR 0002](adr/0002-cost-model.md).

## The calculation

All of it is one pure function per scenario, `calculateScenario(scenario, categories, config)`, in
`src/lib/costing`. It saves nothing: it returns the result and the UI renders it.

## Entities

| Entity       | Key fields                                                                                                                                     | Notes                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Organization | id, name, starting template                                                                                                                    | The tenant                                                              |
| Config       | net annual hours (1,550), default weekly hours (40), overhead %, buffer %, target margin %, holiday calendar                                   | One per organization                                                    |
| Category     | id, name, gross annual salary (or monthly × number of payments), social security % (31%), other yearly costs, manual cost per hour?, sell rate | Restricted access. Cost per hour is derived unless set manually         |
| Person       | id, name, category, weekly hours, area?, active                                                                                                | No individual salary                                                    |
| Project      | id, name, client, pricing model (fixed or T&M), price, overhead %?, buffer %?                                                                  | Empty overrides fall back to Config                                     |
| Scenario     | id, project, name, chosen, frozen rates?, version                                                                                              | `version` provides optimistic locking                                   |
| Assignment   | id, scenario, category, person?, project role, reports to?, weekly hours, allocation %, start date, end date                                   | No person = open role. `reports to` builds the team tree                |
| ExtraCost    | id, scenario, label, kind (fixed, recurring, percentage), amount, base (staff cost or revenue), dates?                                         | Belongs to the scenario: another team may need different infrastructure |

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

| #   | Topic                 | Rule                                                                                                                            |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| a   | Weekly hours          | Stored on the assignment: copied from the person, or from Config for an open role                                               |
| b   | Rate changes          | Choosing a scenario freezes its rates. Other scenarios always use current rates                                                 |
| c   | Over-allocation       | Per person and week: chosen scenarios of other projects plus the scenario being edited. Never two scenarios of the same project |
| d   | Recurring extra costs | Prorated by day. Without dates they span the project, from the first assignment start to the last end                           |
| e   | Price in T&M          | An optional budget cap with a warning. Percentages "over price" use the calculated revenue                                      |
| f   | Margin %              | Over revenue                                                                                                                    |
| g   | Money                 | Integer cents in TypeScript, `numeric` in Postgres, rounded once per result line, EUR only                                      |
| h   | Holidays              | One national calendar in v1; a known limitation                                                                                 |
| i   | Chosen scenario       | At most one per project, enforced by a partial unique index                                                                     |
| j   | Salary leaks          | Without rate access, no costs or margins. A warning when a category has fewer than 3 people, since its cost reveals a salary    |

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

Template config: social security 31%, other costs 3,000 € a year, 1,550 net hours, overhead 15%,
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
