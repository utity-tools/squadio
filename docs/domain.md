# Domain: the cost model

How Squadio turns a scenario into cost, revenue and margin. This file is the specification: change
it first, then the code. Terms are defined in the [glossary](glossary.md); the reasoning behind the
model is in [ADR 0002](adr/0002-cost-model.md).

## The calculation

All of it is one pure function per scenario in `src/lib/costing`,
`calculateScenario(scenario, rates, costSettings, targetMargin)`. It saves nothing: it returns the
result and the UI renders it.

- `rates` give each category a sell rate and an exact cost per hour: the fully loaded annual cost
  over net annual hours, or the manual cost per hour when one is set. A derived cost per hour is
  never rounded to cents, since that would break "rounded once per result line" and the first
  invariant (71,120 € / 1,550 h is 45.8838… €/h, and 45.88 € × 1,550 h is 71,114 €). For a scenario
  that is not chosen they come from the current CategoryRates and Config's net annual hours; for a
  chosen scenario, from its FrozenRates and the net annual hours in its FrozenCostConfig.
- `costSettings` holds the overhead %, the buffer % and the availability factor. For a scenario that
  is not chosen they come from the current CostConfig (or the project's overrides in
  ProjectPricing) and Config; for a chosen scenario they are its FrozenCostConfig.
- `targetMargin` always comes from the current CostConfig: it is never frozen (rule b).
- `scenario` carries its assignments, its extra costs and the project's pricing model and price
  (from ProjectPricing, not frozen).

Current and frozen inputs have the same shape, so the engine does not know whether a scenario is
chosen.

## Entities

Every entity but Organization belongs to one organization and carries its `organization_id`; the
database keeps organizations apart ([ADR 0004](adr/0004-tenant-isolation-with-rls.md)). Money lives
only in the entities marked **Restricted**, which users without rate access cannot read at all
([ADR 0005](adr/0005-rate-access-in-the-database.md)): the rest describe structure and hours.

| Entity           | Key fields                                                                                                                                                        | Notes                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization     | id, name, starting template                                                                                                                                       | The tenant. No table until auth lands in v0.5 and brings Better Auth's organization table; until then `organization_id` is a bare uuid with no foreign key |
| Config           | net annual hours (1,550, whole hours), default weekly hours (40)                                                                                                  | One per organization. The holiday calendar is the national one in v1, a code constant (rule h)                                                             |
| CostConfig       | overhead %, buffer %, target margin %                                                                                                                             | One per organization. Restricted. The target margin may be negative: a project taken at a loss on purpose                                                  |
| Category         | id, name                                                                                                                                                          | Its money lives in CategoryRate                                                                                                                            |
| CategoryRate     | category, gross annual salary (or monthly × number of payments), social security % (31%), other yearly costs, manual cost per hour?, sell rate                    | One per category. Restricted. Cost per hour is derived unless set manually. The monthly form is input only, stored as the annual salary                    |
| Person           | id, name, category, weekly hours, area?, active                                                                                                                   | No individual salary                                                                                                                                       |
| Project          | id, name, client, pricing model (fixed or T&M)                                                                                                                    | Its money lives in ProjectPricing                                                                                                                          |
| ProjectPricing   | project, price, overhead %?, buffer %?                                                                                                                            | One per project. Restricted. Empty overrides fall back to CostConfig                                                                                       |
| Scenario         | id, project, name, chosen, version                                                                                                                                | `version` provides optimistic locking. Nothing sets `chosen` before v0.2, where choosing also writes the frozen tables (rule b)                            |
| FrozenRate       | scenario, category, fully loaded annual cost or manual cost per hour, sell rate                                                                                   | Written when a scenario is chosen (rule b). Restricted. Cost per hour is derived as in CategoryRate, never stored rounded                                  |
| FrozenCostConfig | scenario, overhead %, buffer %, net annual hours, calendar working hours                                                                                          | One per chosen scenario, written with its FrozenRates (rule b). Restricted                                                                                 |
| Assignment       | id, scenario, category, person?, project role, reports to?, weekly hours, allocation %, start date, end date                                                      | No person = open role. `reports to` builds the team tree; deleting an assignment clears `reports to` on those that pointed to it                           |
| ExtraCost        | id, scenario, label?, kind (fixed, recurring, percentage), amount (fixed, recurring) or percentage with its base (staff cost or revenue), dates? (recurring only) | Belongs to the scenario: another team may need different infrastructure. Restricted                                                                        |

## Formulas

Cost per hour of a category:

```math
\text{costPerHour} = \frac{\text{grossSalary} \times (1 + \text{socialSecurity}) + \text{otherCosts}}{\text{netAnnualHours}}
```

The numerator is the fully loaded annual cost. Derived from a CategoryRate it is rounded once to the
cent, half away from zero, since the engine takes it in integer cents (a 31.17% social security on
41,333.33 € gives 12,883.598… €); the template values give whole euros, so there it moves nothing.
The cost per hour itself is never rounded.

Availability factor, derived from Config and the calendar, never typed in:

```math
\text{availability} = \frac{\text{netAnnualHours}}{\text{calendarWorkingHours}} \approx 0.76 \text{ to } 0.78
```

```math
\text{calendarWorkingHours} = \text{workingDays}(\text{reference year}) \times \frac{\text{defaultWeeklyHours}}{5}
```

Calendar working hours are those of a full-time week over a whole year of the national calendar,
never computed per assignment. The engine takes them as an input in `costSettings`, so which year is
the reference is decided where Config's availability is derived, not in the engine: the year of
the scenario's earliest assignment start, so a scenario is costed with the calendar of the year it
runs in. A scenario without assignments has no hours, and the factor then moves nothing. With the
national calendar of rule h a year has about 254 working days (2,032 hours, an availability of
0.763); the guide case sets 1,984 hours instead (248 working days × 8 hours, an availability of
0.78125), an input that keeps its figures round. Weekly hours have at most two decimals, so
calendar working hours have at most three (37.33 h a week over 254 days is 1,896.364 hours), and
they are computed exactly, never as a float product. Net annual hours may not exceed them: an
availability above 1 is a validation error, never a cost.

Working days are the weekdays from the start date to the end date, both included, that are not
national holidays. The national holidays of Spain are the constant: 1 and 6 January, Good Friday,
1 May, 15 August, 12 October, 1 November, 6, 8 and 25 December, listed per year for 2026 to 2028. An
assignment date outside the listed years is a validation error on that field, never a calendar
without holidays.

Hours of an assignment:

```math
\text{nominalHours} = \text{workingDays}(\text{start}, \text{end}) \times \frac{\text{weeklyHours}}{5} \times \frac{\text{allocation}}{100}
```

```math
\text{effectiveHours} = \text{nominalHours} \times \text{availability}
```

Cost:

```math
\text{staffCost}_{\text{category}} = \sum_{\text{its assignments}} \text{effectiveHours} \times \text{costPerHour}_{\text{category}}
```

```math
\text{staffCost} = \sum_{\text{categories}} \text{staffCost}_{\text{category}}
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

Allocation is an integer from 0 to 100, and percentages that touch money are basis points (rule g),
so the formulas divide by 100 and 10,000 where they apply them.

Rounding (rule g):

- Every intermediate value is exact: hours, cost per hour and the products are fractions, never
  floats rounded on the way.
- The result lines are the staff cost of each category, staff cost, each extra cost, direct cost,
  overhead, buffer, total cost, revenue, direct margin and net margin. Each is rounded once to the
  cent, half away from zero.
- Each line is computed from the already rounded lines it depends on (staff cost is the sum of the
  rounded staff cost of each category; direct cost is the rounded staff cost plus the rounded extra
  costs; overhead is the overhead % of the rounded staff cost), so the lines always add up as shown.
- Margin % is rounded to basis points and the effective rate to cents per hour, half away from
  zero. Without revenue there is no margin %, and without effective hours no effective rate.
- A result line beyond what `numeric(12,2)` holds (±9,999,999,999.99 €), or a margin % or effective
  rate too large to hold exactly, is an error, never a silently wrong amount.

A recurring extra cost is an amount per month, prorated by day per calendar month: each month it
covers adds the amount × the days covered / the days in that month, so a whole month costs exactly
the amount. Without dates it spans the project (rule d); in a scenario with no assignments there is
no project span, so an undated recurring cost there is a validation error on that extra cost.

Margin status compares the net margin %, as rounded to basis points, with the target margin:
**green** at or above the target, **amber** below the target with a net margin of zero or more,
**red** with a negative net margin, whatever the target. Without revenue there is no margin %, so there is no status
either, unless the net margin is negative, which is **red**.

Validation: every input is checked with Zod before any calculation, and an invalid one fails with
the path of the field, never a silent result. Missing (`null` or `undefined` where a value is
required), `NaN`, infinite and empty values are all invalid, as are money that is not integer
cents and percentages that are not integer basis points. A sell rate of 0 € is valid (internal or
unbilled work); a fixed price and a T&M budget cap, when set, are at least 1 cent, so a fixed price
always has revenue, and without one the scenario is incomplete (rule l). Weekly hours are at most 168. Assignment, extra cost and category rate ids do
not repeat, an assignment reports to another assignment of the same scenario, and a recurring cost
has both dates or neither (the issue points at the missing one). An extra cost's label, when set,
is 1 to 100 characters and not blank.

The UI shows both nominal hours (to plan) and effective hours (for cost and billing).

### Staff cost by category

Costs are shown per category, never per person ([ADR 0003](adr/0003-structure-not-people.md)), so
a complete result breaks staff cost down into one line per category of the scenario:

- **Which categories:** every category with at least one assignment in the scenario, even when its
  effective hours are 0 (allocation 0%), in the order each first appears in the assignments. A
  category with a rate but no assignment has no line.
- **Effective hours:** the sum of its assignments' effective hours, exact.
- **Cost:** its staff cost, a result line rounded once to the cent from the exact product of its
  hours and its exact cost per hour. Staff cost is the sum of these rounded lines, so they always
  add up to it. Rounding per category instead of over the exact total moves staff cost by at most
  half a cent per category; in the guide case it moves nothing.
- **Cost per hour:** the category's exact cost per hour rounded to cents, half away from zero, for
  display only, like the effective rate. The cost never comes from it, so the shown cost per hour
  times the hours may differ from the cost by a few cents.

An incomplete result (rule k) has no lines, since it has no cost. The lines are money, so they are
restricted like every other result line (ADR 0005).

The small-category warning of rule j is not part of the calculation: it depends on how many active
people the organization has in each category, which is not an input of the engine (see
[Small categories](#small-categories)). The caller adds it to the line with the same category.

Showing whole euros is formatting, not a second rounding: rounded to the euro one by one, the lines
can differ from the staff cost line by up to half a euro per category (in the guide case they add
up to 105,319 € against 105,318 €). Where the lines are shown in whole euros, they keep their exact
cents in the data.

### Why effective hours

Cost per hour is loaded: it divides a year's cost by net hours, which already exclude holidays,
leave and training. Multiplying it by calendar hours would count that time twice and overstate the
cost of long assignments by up to about 28 to 31%, depending on the year. Applying the availability
factor to the hours makes a full year at 100% of the reference year, at the default weekly hours,
cost exactly the fully loaded annual cost (see the first invariant below).

## Rules

| #   | Topic                 | Rule                                                                                                                                                                                                                                                                     |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a   | Weekly hours          | Stored on the assignment: copied from the person, or from Config for an open role                                                                                                                                                                                        |
| b   | Choosing freezes      | Choosing a scenario freezes its category rates (FrozenRate) and its overhead %, buffer % and availability factor (FrozenCostConfig). Target margin is not frozen. Other scenarios always use current values. See [What choosing freezes](#what-choosing-freezes)         |
| c   | Over-allocation       | Per person and week: chosen scenarios of other projects plus the scenario being edited. Never two scenarios of the same project                                                                                                                                          |
| d   | Recurring extra costs | Prorated by day. Without dates they span the project, from the first assignment start to the last end                                                                                                                                                                    |
| e   | Price in T&M          | An optional budget cap with a warning. Percentages "over price" use the calculated revenue                                                                                                                                                                               |
| f   | Margin %              | Over revenue                                                                                                                                                                                                                                                             |
| g   | Money                 | Euros in `numeric(12,2)` in Postgres, integer cents in TypeScript; money-bearing percentages in `numeric(5,2)`, basis points in TypeScript; allocation an integer from 0 to 100 ([ADR 0010](adr/0010-money-in-postgres.md)). Rounded once per result line, EUR only      |
| h   | Holidays              | One national calendar in v1, kept as a constant in code, not in the database; a known limitation. Choosing a scenario freezes its calendar working hours but not the working days of its assignments, so changing the constant still moves the hours of chosen scenarios |
| i   | Chosen scenario       | At most one per project, enforced by a partial unique index                                                                                                                                                                                                              |
| j   | Salary leaks          | Without rate access, no costs or margins: restricted entities return no rows (ADR 0005). A warning when a category has 1 or 2 active people, since its cost reveals a salary. See [Small categories](#small-categories)                                                  |
| k   | Missing rate          | A category without a rate makes its scenarios incomplete: they show a warning and no cost, never a cost of 0                                                                                                                                                             |
| l   | Missing price         | A fixed-price project without a price makes its scenarios incomplete, as in rule k: a warning and no cost or margin, never a revenue of 0                                                                                                                                |

### Small categories

Costs are per category, never per person, but a category's rate is only an average when enough
people share it. With 1 or 2 people, anyone who reads the rate can work out a salary. Rule j turns
that into a warning:

- **Who counts:** the organization's active people in the category, wherever they are assigned.
  Inactive people and open roles do not count: they draw no salary. A scenario's team is not the
  count either, since the rate belongs to the organization, not to the scenario.
- **When it warns:** with 1 or 2 active people. With none the rate describes no one yet; with 3 or
  more it is an average.
- **Where it shows:** wherever the rate is read or edited, and next to the category's cost on the
  canvas. Only users with rate access see costs, so only they see the warning.
- **What it changes:** nothing in the calculation. It is a warning, not a block: the cost is still
  shown, and the organization decides whether to merge the category or accept it.

It is one pure function in `src/lib/rates`, apart from `calculateScenario`: the engine gets a
scenario and its rates, not the organization's headcount.

### What choosing freezes

A chosen scenario is a commitment: its cost must not move because someone edits the organization's
settings later. Choosing it copies, in one transaction, everything its cost depends on that lives
outside the scenario:

- **Category rates** (FrozenRate): the fully loaded annual cost (or manual cost per hour) and the
  sell rate of each category it uses. Its cost per hour is derived from them, never stored rounded.
- **Overhead % and buffer %** (FrozenCostConfig): the values in effect when it is chosen, the
  project's overrides or else the organization's CostConfig.
- **The availability factor** (FrozenCostConfig). It comes from Config (net annual hours and default
  weekly hours) and the holiday calendar, and multiplies every assignment's hours, so without
  freezing it, changing net annual hours would change the cost of every chosen scenario. It is
  stored as its two terms, net annual hours and calendar working hours, so the frozen factor is
  exactly the one the scenario was costed with, with no rounding.

**Target margin is not frozen.** It is a goal, not a cost: changing it never changes a chosen
scenario's cost or margin, only its green, amber or red status, which is always judged against the
organization's current target. The project's price, the scenario's extra costs and the holiday
calendar are not frozen either, so a chosen scenario's margin can still move with them.

**Without rate access** FrozenCostConfig returns no rows, so for those users a chosen scenario's
effective hours use the current Config. They see no cost or margin, so the difference only shows in
effective hours, and only after Config changes.

## Loading a scenario

The loader, `loadScenario` in `src/db`, reads a scenario inside `withOrganization`, builds the
inputs of `calculateScenario` from the current values with the pure functions of `src/lib/scenarios`,
as [The calculation](#the-calculation) lists them, and runs it. Until choosing arrives in v0.2 no scenario is chosen, so there are no frozen values to read.
Every organization has its Config and CostConfig from the moment it exists (the starting template
creates them), so a missing one is an error, never an incomplete result.

Everyone gets the open part, read only from open tables:

- the project's name, client and pricing model, and the scenario's name and whether it is chosen;
- the team: each assignment's project role, category (id and name), person (id and name, or none
  for an open role), reports to, weekly hours, allocation and dates, in the order of their start
  date;
- the project span, from the first assignment start to the last assignment end (rule d), with its
  working days; a scenario without assignments has none.

The organization's name is not part of it: there is no Organization table until v0.5.

- **With rate access** it adds the engine's result, the small-category warning of rule j for
  each category of the scenario that has 1 or 2 active people, and what the summary shows next to
  the result lines: the overhead % and buffer % the engine applied (the project's overrides or
  else the CostConfig), the target margin, and each extra cost's label and kind.
- **Without rate access** the restricted tables return no rows, so it adds only the hours: the
  scenario's nominal and effective hours and those of each assignment. Never a result line, a rate
  or a warning about money.

An assignment date outside the calendar's years stays a validation error on that field (see
[Formulas](#formulas)): neither the reference year nor the project span turns it into another kind
of error.

To edit the scenario, the loader also returns its **basis**: everything the page needs besides the
team to show it and recalculate it on every change, with the same pure function the loader runs
(`scenarioView` in `src/lib/scenarios`). It holds the open part's project and scenario, every
category and person of the organization (name, category, weekly hours and whether active, which
the change model checks against), Config's default weekly hours and the engine's inputs without
assignments. With rate access these are the engine's inputs, never the stored salaries, plus every
small category of the organization; without it, only the hours inputs, which hold no money
([ADR 0005](adr/0005-rate-access-in-the-database.md)). The team, as the change model's
assignments, and the scenario's version, the base of the next save, come with it.

## Editing a scenario

v0.2 lets people build a scenario's team. Every edit is a change, made the same way by dragging,
by the keyboard menus or by undo and redo ([ADR 0008](adr/0008-simulator-interaction-stack.md)).
The change model is pure and lives in `src/lib/scenarios`; saving is in
[ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md).

Editing a team needs no rate access: assignments hold hours and structure, never money
([ADR 0005](adr/0005-rate-access-in-the-database.md)). Without rate access the summary keeps showing
hours only.

### Changes

| Change  | What it does                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add     | Adds an assignment: a person (taking their category and weekly hours, rule a) or an open role (a category and Config's default weekly hours), with a project role, allocation, dates and reports to |
| Move    | Changes who an assignment reports to: another assignment of the scenario, or none (a root)                                                                                                          |
| Remove  | Deletes an assignment. Its direct reports move up to the assignment it reported to, or become roots, so removing someone never removes their team                                                   |
| Edit    | Changes an assignment's project role, allocation, weekly hours or dates, fills an open role with a person, or turns a person's assignment back into an open role                                    |
| Restore | Puts a removed assignment back exactly as it was, with the reports it had. Only undo makes it: it is the inverse of a remove                                                                        |

A new assignment starts at 100% allocation and spans the project (rule d), or, in a scenario without
assignments, the next full month. Ids of new assignments are made by the client
(`crypto.randomUUID()`), so a change means the same thing before and after it is saved. For the
same reason, an edit that fills an open role is recorded with the weekly hours it copied from the
person, not left to copy them again when it is saved. Turning a person's assignment back into an
open role keeps its weekly hours: they describe the seat, and the edit can change them.

A change is checked against the team it applies to, and a rejected change never reaches the history
(ADR 0008, point 5). It is rejected, with a reason the UI can show, when:

- **it changes nothing:** a move to where the assignment already reports, or an edit to the values
  it already has. It would only take an undo slot;
- **it makes a cycle:** an assignment would report to itself or to one of its own reports;
- **the same person appears twice** in the scenario. A person who works on two parts of a project
  is one assignment with the sum of both allocations;
- **a person fills an assignment of another category.** The cost is per category (ADR 0003), so
  someone else's category would cost them at another rate. Add them as themselves instead;
- **the person is inactive;**

The person's checks (inactive, category, and whether the organization knows them) apply when a
person is placed: an add with a person, or an edit that changes who fills an assignment. A loaded
team may already hold a person who was deactivated or moved to another category after being
assigned; editing that assignment's other fields, removing it and undoing the removal still work.
A restore only checks that the team can take it back: its id is free, its parent and reports exist,
it makes no cycle, the organization still knows its category and person, and the person is not on the
scenario again. Undo can still fail when the team
cannot take an inverse (for example, undoing an edit that replaced a person who is now inactive):
the UI says so and the history stays where it was.

- **the dates are impossible:** the end before the start, or a date outside the calendar's years
  (rule h);
- **a value is out of range:** allocation outside 0 to 100, weekly hours above 168 or not in
  hundredths, an empty or blank project role, or one longer than 100 characters;
- **it points at nothing:** an assignment, person, category or parent that is not in the scenario or
  the organization, or an add whose id is already taken.

### History, undo and redo

The history is the list of changes made in the page, with a cursor. Undo moves the cursor back one
change and redo forward one; a new change drops everything after the cursor. Each entry keeps its
change and the inverse that undoes it, computed against the team it applied to (undoing a remove
restores the assignment and puts its reports back under it).

What is left to save is kept next to the history: every change, undo and redo adds the changes it
applied (a change, or an entry's inverse), and a successful save drops those it sent. Undoing a saved
change therefore saves its inverse, and the history survives saving. The history lives in memory
only: reloading the page starts from what was last saved.

### How busy a person is

The bench shows how busy each active person is **today**: the sum of their allocation over every
chosen scenario with one of their assignments covering today (start and end included), in the
`Europe/Madrid` time zone. It is an integer percentage and may exceed 100%, which is
over-allocation (rule c). Open roles and scenarios that are not chosen do not count. It holds no
money, so everyone sees it. Week by week over-allocation, with the scenario being edited, is v0.4's
health check.

### Choosing a scenario

Choosing a scenario needs rate access and does what rule b says, in one transaction: it marks it
chosen, unmarks the project's previously chosen scenario (rule i) and deletes that one's frozen
rows, and writes the new scenario's FrozenRates (one per category it uses) and its
FrozenCostConfig, read from the current values. Unchoosing, also with rate access only, deletes its
frozen rows.

**A chosen scenario's team cannot be edited.** It is a commitment, and a category added after
choosing would have no frozen rate, while writing one needs rate access that editing does not. To
change it, unchoose it, edit it and choose it again, which freezes the current values.

## Configuration per organization

Each organization creates its own categories and sets every number. A salary can be entered per year
or per month with the number of payments (2,100 €/month × 14 = 29,400 €/year). On sign-up the
organization picks a starting template (Consultancy, Startup, Design agency) and edits it.

The Consultancy template, also used by the demo organization (Madrid, 2026, indicative). The demo's
first scenario is the guide case team, costed with the 2027 calendar rather than the guide case's
1,984 hours, so its figures differ slightly from the table below:

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

The first test of the costing engine. Fixed price of 200,000 € over 26 weeks, from 1 April to
29 September 2027 (130 working days, no national holiday on a weekday): Senior Developer at 100%,
Frontend Developer at 100%, DevOps Engineer at 50%, Project Manager at 50%, all at 40 hours a week,
and cloud at 1,000 € a month with no dates of its own, so it spans the project. Calendar working
hours are 1,984. Figures are rounded to the euro here; the test pins the exact cents.

| Line                                 |                  Amount |
| ------------------------------------ | ----------------------: |
| Staff cost (2,437.5 effective hours) |               105,318 € |
| Cloud                                |                 5,967 € |
| Direct cost                          |               111,285 € |
| Overhead                             |                15,798 € |
| Buffer                               |                12,708 € |
| Total cost                           |               139,791 € |
| Direct margin                        |        88,715 € (44.4%) |
| Net margin                           | 60,209 € (30.1%), green |
| Effective rate                       |               82.05 €/h |

Staff cost by category (cost per hour rounded for display; cost to the cent, as the engine returns
it):

| Category           | Effective hours | Cost per hour |             Cost |
| ------------------ | --------------: | ------------: | ---------------: |
| Project Manager    |          406.25 |       48.42 € |      19,670.36 € |
| Senior Developer   |           812.5 |       45.88 € |      37,280.65 € |
| Frontend Developer |           812.5 |       37.43 € |      30,413.71 € |
| DevOps Engineer    |          406.25 |       44.19 € |      17,953.63 € |
| **Staff cost**     |     **2,437.5** |               | **105,318.35 €** |

Staff cost uses the exact cost per hour (45.8838… €/h for a Senior Developer), not the rounded
45.88 € of the template table. Cloud is five whole months and 29 of September's 30 days. For
reference, the same team billed as T&M would bring 148,688 €.

## Invariants

Property-based tests (fast-check) check these on random scenarios:

- A full year at 100%, in the reference year and at the default weekly hours, costs exactly the
  category's fully loaded annual cost.
- Adding an assignment never lowers the cost.
- With a fixed price, more cost always means less margin.
- The `reports to` tree never has cycles.
- The staff cost of each category is its exact cost rounded once, and staff cost is their sum, never
  more than half a cent per category away from the exact total.
- With revenue above zero, the effective rate is positive before rounding (without effective hours
  there is none).

And on random sequences of changes, undo, redo and saves (see
[Editing a scenario](#editing-a-scenario)):

- An accepted change never leaves a cycle or the same person twice.
- Applying an accepted change's inverse gives back exactly the team before it, unless it places
  again a person who is now inactive or in another category, and then it is rejected.
- Applying what is left to save to the last saved team gives exactly the current team.

## Out of scope for v1

Productivity by seniority and cost per deliverable, real availability and skills beyond
over-allocation, schedule effects (more people do not always finish sooner), and a hidden per-person
cost adjustment. The model can take each of them by adding a field.
