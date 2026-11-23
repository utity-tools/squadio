# Domain: the cost model

How Squadio turns a scenario into cost, revenue and margin. This file is the specification: change
it first, then the code. Terms are defined in the [glossary](glossary.md); the reasoning behind the
model is in [ADR 0002](adr/0002-cost-model.md).

## The calculation

All of it is one pure function per scenario in `src/lib/costing`,
`calculateScenario(scenario, rates, costSettings, targetMargin)`. It saves nothing: it returns the
result and the UI renders it. A result line it cannot compute because data is missing is
undetermined, never 0 ([Partial results](#partial-results)).

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
- `scenario` carries its assignments, its extra costs, the project's pricing model and price
  (from ProjectPricing, not frozen) and the project's planned period, if any (not frozen).

Current and frozen inputs have the same shape, so the engine does not know whether a scenario is
chosen.

**The v0.5 target** (slice 6): a chosen scenario is no longer costed from frozen rows. It is read
from its chosen revision, which stores its inputs and its result ([Revisions](#revisions)), and the
engine only costs scenarios that are not chosen, and revisions when they are made.

## Entities

Every entity but Organization belongs to one organization and carries its `organization_id`; the
database keeps organizations apart ([ADR 0004](adr/0004-tenant-isolation-with-rls.md)). Money lives
only in the entities marked **Restricted**, which users without rate access cannot read at all
([ADR 0005](adr/0005-rate-access-in-the-database.md)): the rest describe structure and hours.

| Entity           | Key fields                                                                                                                                                        | Notes                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization     | id, name, example                                                                                                                                                 | The tenant. Better Auth's `auth.organization` since v0.3 ([ADR 0012](adr/0012-sign-in-and-membership.md)); every tenant table's `organization_id` references it, without a cascade (migration 0009). `example` marks one adopted from a visitor's copy |
| Config           | net annual hours (1,550, whole hours), default weekly hours (40)                                                                                                  | One per organization. The holiday calendar is the national one in v1, a code constant (rule h)                                                                                                                                                         |
| CostConfig       | overhead %, buffer %, target margin %                                                                                                                             | One per organization. Restricted. The target margin may be negative: a project taken at a loss on purpose                                                                                                                                              |
| Category         | id, name                                                                                                                                                          | Its money lives in CategoryRate                                                                                                                                                                                                                        |
| CategoryRate     | category, gross annual salary (or monthly × number of payments), social security % (31%), other yearly costs, manual cost per hour?, sell rate                    | One per category. Restricted. Cost per hour is derived unless set manually. The monthly form is input only, stored as the annual salary                                                                                                                |
| Person           | id, name, category, weekly hours, area?, active                                                                                                                   | No individual salary. Everyone reads people; only users with rate access write them, since a write moves rule j's count                                                                                                                                |
| Project          | id, name, client, pricing model (fixed or T&M), planned start?, planned end?, description?                                                                        | Its money lives in ProjectPricing. The planned period has both dates or neither (v0.3, [Planned period](#planned-period)); the description is 1 to 500 characters and not blank                                                                        |
| ProjectPricing   | project, price, overhead %?, buffer %?                                                                                                                            | One per project. Restricted. Empty overrides fall back to CostConfig                                                                                                                                                                                   |
| Scenario         | id, project, name, chosen, version                                                                                                                                | `version` provides optimistic locking; choosing and unchoosing move it on too. Choosing writes its frozen tables (rule b). From v0.5 it also has its chosen revision and, for a derived alternative, the revision it came from and its author          |
| FrozenRate       | scenario, category, fully loaded annual cost or manual cost per hour, sell rate                                                                                   | Written when a scenario is chosen (rule b). Restricted. Cost per hour is derived as in CategoryRate, never stored rounded. Retired in v0.5's slice 6 by revisions                                                                                      |
| FrozenCostConfig | scenario, overhead %, buffer %, net annual hours, calendar working hours                                                                                          | One per chosen scenario, written with its FrozenRates (rule b). Restricted. Retired in v0.5's slice 6 by revisions                                                                                                                                     |
| Revision         | id, scenario, number, made at, author?, why, rules version, commit, open part                                                                                     | v0.5. Never updated. The open part is a JSON snapshot of the team and its hours, without money ([Revisions](#revisions))                                                                                                                               |
| RevisionMoney    | revision, restricted part                                                                                                                                         | v0.5. One per revision, never updated. Restricted. A JSON snapshot of rates, settings, price, planned period, extra costs and result, in cents and basis points                                                                                        |
| Assignment       | id, scenario, category, person?, project role, reports to?, weekly hours, allocation %, start date, end date                                                      | No person = open role. `reports to` builds the team tree; deleting an assignment clears `reports to` on those that pointed to it                                                                                                                       |
| ExtraCost        | id, scenario, label?, kind (fixed, recurring, percentage), amount (fixed, recurring) or percentage with its base (staff cost or revenue), dates? (recurring only) | Belongs to the scenario: another team may need different infrastructure. Restricted                                                                                                                                                                    |

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
the amount. Without dates it spans the project's planned period, or else the project span (rule d);
when the scenario has no assignments and the project has no planned period there is no span, and
the cost is undetermined until the project gets a planned period or the scenario a team
([Partial results](#partial-results)).

Margin status compares the net margin %, as rounded to basis points, with the target margin:
**green** at or above the target, **amber** below the target with a net margin of zero or more,
**red** with a negative net margin, whatever the target. Without revenue there is no margin %, so there is no status
either, unless the net margin is negative, which is **red**. With an undetermined net margin there is
no status at all.

Validation: every input is checked with Zod before any calculation, and an invalid one fails with
the path of the field, never a silent result. Missing (`null` or `undefined` where a value is
required), `NaN`, infinite and empty values are all invalid, as are money that is not integer
cents and percentages that are not integer basis points. A sell rate of 0 € is valid (internal or
unbilled work); a fixed price and a T&M budget cap, when set, are at least 1 cent, so a fixed price
always has revenue, and without one revenue is undetermined (rule l). Weekly hours are above 0 and at most 168, in hundredths. Assignment, extra cost and category rate ids do
not repeat, an assignment reports to another assignment of the same scenario, and a recurring cost
has both dates or neither (the issue points at the missing one). An extra cost's label, when set,
is 1 to 100 characters and not blank.

The UI shows both nominal hours (to plan) and effective hours (for cost and billing).

### Staff cost by category

Costs are shown per category, never per person ([ADR 0003](adr/0003-structure-not-people.md)), so
every result, complete or partial, breaks staff cost down into one line per category of the
scenario:

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

A category without a rate (rule k) has its line, with its effective hours and an undetermined cost
and cost per hour; the categories with a rate keep theirs. The lines are money, so they are
restricted like every other result line (ADR 0005).

The small-category warning of rule j is not part of the calculation: it depends on how many active
people the organization has in each category, which is not an input of the engine (see
[Small categories](#small-categories)). The caller adds it to the line with the same category.

Showing whole euros is formatting, not a second rounding: rounded to the euro one by one, the lines
can differ from the staff cost line by up to half a euro per category (in the guide case they add
up to 105,319 € against 105,318 €). Where the lines are shown in whole euros, they keep their exact
cents in the data.

### Partial results

A result is made of lines, and each line is in one of four states:

| State          | Meaning                                                                              | Shown as                                                    |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Determined     | Computed from inputs that are all known, exactly as for a complete result            | The amount                                                  |
| Undetermined   | An input it needs is missing: a category's rate (k), a fixed price (l) or a span (d) | No amount, never 0, and what is missing                     |
| Not applicable | The line has no meaning for these inputs, whatever is filled in                      | No amount, and why (no revenue for a margin %, for example) |
| Invalid        | An input breaks a validation rule                                                    | The whole result fails with the field's path                |

Invalid input never gives a partial result: validation runs first and fails as before. Only missing
data is undetermined.

The summary adds no figure of its own to a result, only ways to show it: it counts the lines with an
amount ("Complete · N of N lines"), splits revenue into a cost share (100 % − net margin %, from its
basis points) and the net margin, and holds the net margin back while the team is empty, although
the engine determines it from the price and the extra costs, unless an undated recurring cost lacks
its span.

Which line depends on which:

- **Staff cost of a category:** undetermined without its rate. **Staff cost:** undetermined if any
  category's line is.
- **A fixed or dated recurring extra cost:** always determined. **An undated recurring extra cost:**
  undetermined without a span, that is in a scenario without assignments of a project without a
  planned period (rule d). **A percentage extra cost:** undetermined if its base (staff cost or
  revenue) is.
- **Revenue:** with a fixed price, the price, or undetermined without one. In T&M, undetermined if
  any category of the team has no rate, since its sell rate lives in the rate.
- **Direct cost** (staff cost and each extra cost), **overhead** (staff cost), **buffer** (direct
  cost and overhead) and **total cost** (direct cost, overhead and buffer): each is undetermined if
  any line it is computed from is. With only a price missing and a percentage cost over revenue,
  overhead stays determined while direct cost, buffer and total cost do not.
- **Direct and net margin:** undetermined if revenue or the cost they subtract is.
- **Margin %:** undetermined with an undetermined margin; not applicable with a revenue of 0.
- **Effective rate:** not applicable without effective hours, whatever revenue is; otherwise
  undetermined with undetermined revenue.
- **Budget cap warning (rule e):** judged only with determined revenue. With undetermined revenue it
  is not judged, and the UI never says the cap holds.
- **Hours** (nominal and effective) never depend on money: they are always determined.
- **Margin status:** none unless the net margin is determined (see [Formulas](#formulas)).

A determined line is computed and rounded exactly as in a complete result, only from determined,
rounded lines, so filling in the missing data never changes the lines that were already shown (an
invariant below). The overflow check of [Formulas](#formulas) applies to determined lines; filling
in the data can still make the whole result fail with it. A subtotal of the determined lines is
never shown as a total: where the total is undetermined, the UI says what is missing (each category
without a rate, the missing price) instead. A category's rate holds its cost and its sell rate, and
the UI names the one each line needs: the cost for cost lines, the sell rate for T&M revenue and the
effective rate, and both for a T&M margin («Falta el coste de …», «Falta la tarifa de venta de …»). The complete result, with every line determined, keeps
the guide case and the invariants as its tests.

Choosing is unchanged: a missing rate still blocks it and a missing price does not
([Choosing a scenario](#choosing-a-scenario)).

### Why effective hours

Cost per hour is loaded: it divides a year's cost by net hours, which already exclude holidays,
leave and training. Multiplying it by calendar hours would count that time twice and overstate the
cost of long assignments by up to about 28 to 31%, depending on the year. Applying the availability
factor to the hours makes a full year at 100% of the reference year, at the default weekly hours,
cost exactly the fully loaded annual cost (see the first invariant below).

## Rules

| #   | Topic                 | Rule                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Weekly hours          | Stored on the assignment: copied from the person when one is placed (add or edit), or from Config for a new open role; an edit may change them                                                                                                                                                                                                                                |
| b   | Choosing freezes      | Choosing a scenario freezes its category rates (FrozenRate) and its overhead %, buffer % and availability factor (FrozenCostConfig). Target margin is not frozen. Other scenarios always use current values. See [What choosing freezes](#what-choosing-freezes). v0.5 target (slice 6): choosing points at a revision instead ([Revisions](#revisions))                      |
| c   | Over-allocation       | Per person and week: chosen scenarios of other projects plus the scenario being edited. Never two scenarios of the same project. See [Weekly load](#weekly-load)                                                                                                                                                                                                              |
| d   | Recurring extra costs | Prorated by day. Without dates they span the project's planned period, or, without one, the project span: from the first assignment start to the last end. Without either, such a cost is undetermined, never 0. See [Partial results](#partial-results)                                                                                                                      |
| e   | Price in T&M          | An optional budget cap with a warning. Percentages "over price" use the calculated revenue                                                                                                                                                                                                                                                                                    |
| f   | Margin %              | Over revenue                                                                                                                                                                                                                                                                                                                                                                  |
| g   | Money                 | Euros in `numeric(12,2)` in Postgres, integer cents in TypeScript; money-bearing percentages in `numeric(5,2)`, basis points in TypeScript; allocation an integer from 0 to 100 ([ADR 0010](adr/0010-money-in-postgres.md)); a revision's restricted part holds them as integer cents and basis points in JSON (ADR 0010, 2026-11-23). Rounded once per result line, EUR only |
| h   | Holidays              | One national calendar in v1, kept as a constant in code, not in the database; a known limitation. Choosing a scenario freezes its calendar working hours but not the working days of its assignments, so changing the constant still moves the hours of chosen scenarios until v0.5's slice 6, when they come from the chosen revision                                        |
| i   | Chosen scenario       | At most one per project, enforced by a partial unique index                                                                                                                                                                                                                                                                                                                   |
| j   | Salary leaks          | Without rate access, no costs or margins: restricted entities return no rows (ADR 0005). A warning when a category has 1 or 2 active people, since its cost reveals a salary. See [Small categories](#small-categories)                                                                                                                                                       |
| k   | Missing rate          | A category without a rate leaves its staff cost line undetermined, and every line that depends on it, never a cost of 0. The other lines are still shown. See [Partial results](#partial-results)                                                                                                                                                                             |
| l   | Missing price         | A fixed-price project without a price leaves revenue undetermined, and every line that depends on it, never a revenue of 0. Costs that do not depend on revenue are still shown. See [Partial results](#partial-results)                                                                                                                                                      |

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

**Until revisions exist, a chosen scenario is not a record of its result.** What it keeps is the
list above and nothing more: its result can still move with what is not frozen, and unchoosing
deletes the frozen rows. The UI calls it chosen, never frozen or approved as a whole.

**The v0.5 target** (slice 6, [ADR 0013](adr/0013-scenario-revisions.md)): choosing points at a
revision, which holds all of the above and also the price, the planned period, the extra costs, the
hours and the result, so nothing but the margin status moves a chosen scenario. Unchoosing removes
the pointer and keeps the revision. A migration makes a revision for every chosen scenario from its
existing frozen rows, never from current rates, and from the values it is costed with today for the
rest, so no chosen result moves; a later migration drops FrozenRate and FrozenCostConfig. See
[Choosing a revision](#choosing-a-revision).

**Target margin is not frozen.** It is a goal, not a cost: changing it never changes a chosen
scenario's cost or margin, only its green, amber or red status, which is always judged against the
organization's current target. The project's price and planned period, the scenario's extra costs
and the holiday calendar are not frozen either, so a chosen scenario's margin can still move with
them: a new planned period moves its undated recurring costs although its team is locked.

**Without rate access** FrozenCostConfig returns no rows, so for those users a chosen scenario's
effective hours use the current Config. They see no cost or margin, so the difference only shows in
effective hours, and only after Config changes. A revision keeps its effective hours in its open
part, so from slice 6 everyone reads the same hours.

## Loading a scenario

The loader, `loadScenario` in `src/db`, reads a scenario inside `withOrganization`, builds the
inputs of `calculateScenario` with the pure functions of `src/lib/scenarios`, as
[The calculation](#the-calculation) lists them, and runs it: from the current values, or, for a
chosen scenario read with rate access, from its FrozenRates and FrozenCostConfig. The demo seed
freezes its two chosen scenarios the way choosing does. A chosen scenario without frozen rows,
chosen before slice 7 and skipped by its backfill because a category has no rate, is costed with
the current values and keeps undetermined lines (rule k) until it is chosen again.
Every organization has its Config and CostConfig from the moment it exists (the starting template
creates them), so a missing one is an error, never a partial result.

Everyone gets the open part, read only from open tables:

- the project's name, client, pricing model, planned period and description, the scenario's name and
  whether it is chosen, and
  the name of the project's other chosen scenario, if any, which choosing this one replaces (rule i);
- the team: each assignment's project role, category (id and name), person (id and name, or none
  for an open role), reports to, weekly hours, allocation and dates, in the order of their start
  date;
- the project span, from the first assignment start to the last assignment end (rule d), with its
  working days; a scenario without assignments has none.

The organization's name is not part of it: the organization page reads it from `auth.organization`.

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
the change model checks against), Config's default weekly hours, the project's planned period (new
assignments start from it, the engine's inputs carry it for undated recurring costs, and it holds
no money) and the engine's inputs without assignments. With rate access these are the engine's inputs, never the stored salaries, plus every
small category of the organization; for a chosen scenario its frozen rates, which cover only the
categories its team uses, since its team cannot be edited; without it, only the hours inputs, which hold no money
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

A signed-in member creates a project's scenarios from its page, one at a time: an empty team, not
chosen, named after how many the project has («Escenario 2»), which opens in the editor. It needs no
rate access, and the server refuses it until the organization has a category, since a team is
built from them. A
visitor's copy and the demo never create an empty one; anyone with rate access may duplicate one
instead ([Duplicating a scenario](#duplicating-a-scenario)).

### Changes

| Change  | What it does                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add     | Adds an assignment: a person (taking their category and weekly hours, rule a) or an open role (a category and Config's default weekly hours), with a project role, allocation, dates and reports to |
| Move    | Changes who an assignment reports to: another assignment of the scenario, or none (a root)                                                                                                          |
| Remove  | Deletes an assignment. Its direct reports move up to the assignment it reported to, or become roots, so removing someone never removes their team                                                   |
| Edit    | Changes an assignment's project role, allocation, weekly hours or dates, fills an open role with a person, changes who fills it, or turns a person's assignment back into an open role              |
| Restore | Puts a removed assignment back exactly as it was, with the reports it had. Only undo makes it: it is the inverse of a remove                                                                        |

A new assignment starts at 100% allocation and spans the project's planned period, or else the
project span (rule d), or, in a scenario without assignments of a project without a planned period,
the next full month. Its project role starts as its category's name, and can be
changed. Ids of new assignments are made by the client
(`crypto.randomUUID()`), so a change means the same thing before and after it is saved. For the
same reason, an edit that fills an open role is recorded with the weekly hours it copied from the
person, not left to copy them again when it is saved. Turning a person's assignment back into an
open role keeps its weekly hours: they describe the seat, and the edit can change them.

Dragging takes the same steps as the menus, and drops only where they would act
(`dropAction` in `src/lib/scenarios`). A person dragged from the bench onto an assignment is added
as its report, and onto the canvas at the top of the team, with the defaults above: the drop opens
no dialog, and "Edit…" or undo change it after. A person already on the team cannot be dropped. An
open role dragged from the bench is added the same way, with Config's weekly hours, as often as it
is dropped. An assignment dragged onto another one moves under it, and onto the canvas to the top,
only where "Move to…" offers it; anywhere else the drop does nothing.

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
- **a value is out of range:** allocation outside 0 to 100, weekly hours not above 0, above 168 or not in
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
health check ([Weekly load](#weekly-load)). The bench also marks who is already on the team being edited, since a person can be
on a scenario only once.

### The demo's dates

The demo seed keeps the guide case's fixed 2027 dates, so its figures here, in the README, in the
tests and on the landing, which costs Plan A from the same data (`src/lib/demo/guide-case.ts`), never
change. Its two ongoing projects, whose chosen scenarios give the bench its occupancy,
are anchored instead to the day the seed runs, in `Europe/Madrid`:

- **Delivery plan:** from the first working day of the month 8 months back to the last working day
  of the month 5 months ahead.
- **Run plan:** from the first working day of the month 4 months back to the last working day of the
  month 7 months ahead.

Internal tooling's planned period, 1 April to 31 December 2027, is fixed too, not anchored to the
seed's day: its scenario has no extra costs, so it moves no figure.

Both are clamped to the years the national calendar lists (rule h), and never start after or end
before the seed's day, so they always cover it: on the calendar's first or last day off, covering it
wins and a span starts or ends on that day. A seed run on a day outside those years fails: the
calendar needs a new year. Each scenario is frozen with the calendar of its reference year, as
choosing does. Production reseeds on every deploy and daily (ADR 0006), so its spans follow today.

### Choosing a scenario

Choosing a scenario needs rate access and does what rule b says, in one transaction: it marks it
chosen, unmarks the project's previously chosen scenario (rule i) and deletes that one's frozen
rows, and writes the new scenario's FrozenRates (one per category it uses) and its
FrozenCostConfig, read from the current values. Unchoosing, also with rate access only, deletes its
frozen rows. Both move the scenario's version on, like a save, so a page holding an older version
gets a conflict instead of overwriting the choice. A scenario with a category without a rate cannot
be chosen: there is no rate to freeze (rule k). An empty team commits to nothing: the page does not
offer choosing it, and the server refuses it from v0.3. Those are the only rules that block
choosing: a scenario with undetermined revenue (a missing price), or one whose dates fall outside the calendar,
can be chosen, and its calendar working hours are those of the calendar's first year, as the engine uses.
Choosing what is chosen, or unchoosing what is not, is refused as changing nothing, and the demo
template is never chosen or unchosen: only its visitors' copies are
([ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md)).

**A chosen scenario's team cannot be edited.** It is a commitment, and a category added after
choosing would have no frozen rate, while writing one needs rate access that editing a team does
not. To
change it, unchoose it, edit it and choose it again, which freezes the current values.

**The v0.5 target** (slice 6): choosing does all of the above with a revision instead of frozen rows.
Choosing a scenario makes or reuses its latest revision and points at it; choosing an older revision
lists what changed since first; unchoosing removes the pointer only. The rules that block choosing,
and the locked team, stay. See [Choosing a revision](#choosing-a-revision).

### Duplicating a scenario

From v0.4 a scenario can be duplicated, to make a variant of a team without rebuilding it. The copy
is a new scenario of the same project, in one transaction:

- **What it copies:** every assignment, with new ids and its `reports to` pointing at the copy's
  assignment that matches the one it pointed at, so the team tree is the same; and every extra
  cost, with a new id. A scenario has no settings of its own besides its name: overrides live on
  the project (ProjectPricing), which both scenarios share. Nothing is shared with the original, so
  editing one never touches the other.
- **What it does not copy:** whether it is chosen, the frozen rows and, from v0.5, its revisions. The copy is always a draft
  with version 1, costed with the current values (rule b). A chosen scenario may be duplicated:
  its copy keeps its team and extra costs but not its frozen rates, so its cost differs when rates
  changed after choosing. A non-chosen scenario and its copy give the same cost and margin.
- **People are copied as they are:** a person who was deactivated or moved to another category
  after being assigned stays on the copy, as a loaded team keeps them ([Changes](#changes)).
- **Its name** is the original's followed by a suffix in the language of whoever duplicates, like a
  new scenario's: in Spanish « (copia)», or « (copia 2)», « (copia 3)» and so on, the first one no
  scenario of the project has (« (copy)» in English). The original's name is cut at the end, never
  the suffix, so the whole stays within 100 characters, and spaces the cut leaves at its end are
  dropped. A copy of a copy is numbered with the original, not given a second suffix: duplicating
  «Plan A (copia)» gives «Plan A (copia 2)», or the next number the project does not have. A name
  counts as a copy when it ends in the suffix of the language of whoever duplicates.
- **It needs rate access,** like choosing: extra costs are restricted money
  ([ADR 0005](adr/0005-rate-access-in-the-database.md)), and a copy without them would cost
  differently without its author seeing it. A page without rate access, `?access=none` included,
  does not offer it, and the server refuses whoever lacks it. A member also needs to edit teams,
  since the copy is a team to edit.
- **At most 20 scenarios per project:** duplicating into a project that has 20 is refused, for
  members and visitors alike. The limit is on duplicating only: creating an empty scenario is
  not limited in v0.4.
- **It waits for the original:** a save or a choice of the original waits for the copy, or the copy
  for them, so the copy never holds half a save. Choosing and duplicating lock the project before
  its scenarios, so neither waits on the other forever.
- **Visitors duplicate in their copy:** the demo template is never written, so a visitor without a
  copy gets one in the same transaction, as on a first save
  ([ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md)).

The copy opens in the editor. Comparing it with its original matches people by person, since its
assignments have new ids ([Comparing scenarios](#comparing-scenarios)).

## The organization at a glance

Inicio and the projects list show every project of the organization at once, costed exactly as
the scenario page costs each scenario: the same engine over the same basis, a chosen scenario with
its frozen values (rule b). Nothing here is stored; it is read again on every request. In code this
is the organization's portfolio: `loadPortfolio` reads it, and `src/lib/portfolio` works out what
follows.

With rate access each scenario's money also lists its undated recurring costs, by id and label,
never their amounts: the project form names the ones a new planned period moves
([Planned period](#planned-period)). Without rate access a scenario has no money, so no list.

### A project's margin

A project's margin is the net margin and status of one of its scenarios, never a sum or an average
of several:

- **The chosen scenario's**, when it has one.
- **Its only scenario's**, when none is chosen and it has exactly one, marked as not chosen.
- **None** when none is chosen and it has two or more: the project says how many scenarios it has,
  since picking one of them would be a choice nobody made. Nor does a project without scenarios.

Margins of different projects are never added: each margin % is over its own revenue (rule f). A
margin that is pending says what it misses, as on the scenario page. Margins and status are
restricted (rule j): without rate access the project shows its scenario only.

### Pending corrections

What Inicio asks the organization to fix: the warnings the engine reports on every scenario of the
organization, chosen or not, gathered **once per missing input, not once per scenario**:

- **A category's missing cost:** a category without a rate that some scenario uses (rule k).
- **A category's missing sell rate:** the same category, only when a scenario of a time-and-
  materials project uses it, since a fixed price does not need it. A category's cost and sell rate
  live in one rate today, so both corrections appear together.
- **A project's missing price:** a fixed-price project without a price that has a scenario (rule l).
- **A project's missing planned period:** a project without a planned period with a scenario whose
  undated recurring cost has no span: it has no assignments (rule d).
- **A project's exceeded budget cap:** a warning, once per time-and-materials project, for the
  scenarios whose revenue is over its cap (rule e).

Each correction names the first scenario it affects (chosen scenarios first, then by project and
scenario name) and how many more it affects, and leads to that scenario; a missing price or planned
period leads to the project. They are listed in the order above, then by name. All of them are
restricted: which categories lack a rate is itself restricted, so without rate access there are
none, nor a count.

### Occupancy by category

Today's occupancy of a category is that of its active people (see
[How busy a person is](#how-busy-a-person-is)), weighted by their weekly hours: the share of the
category's working week that chosen scenarios book today, rounded to a whole percent, half up. A
part-time person weighs less than a full-time one. It may exceed 100%. Categories without active
people are left out; open roles and scenarios that are not chosen do not count. It holds no money,
so everyone sees it, and it is not availability during a project.

## Planned period

From v0.3 a project may have a planned period, a start and an end date, and a short description
for whoever reads its proposal. The period is a reference, not a limit:

- **New assignments start from it:** an add spans the planned period instead of the project span,
  as [Changes](#changes) says. An assignment's own dates stay editable.
- **It never refuses an assignment.** One that starts before it or ends after it is flagged on the
  team, with how far outside it falls in calendar days; so is a planned period the team as a whole
  does not cover, from its first start to its last end, with how many days it leaves at each side.
  A scenario without a team flags nothing. The flags hold no money: everyone sees them.
- **Undated recurring costs follow it** (rule d), in every scenario of the project, so all of them
  are costed over the same months. Without a planned period they follow each scenario's project span,
  as before, and in a scenario without assignments they are undetermined (rule d): removing the
  whole team or clearing the period never makes the scenario fail.
- **Changing it keeps every assignment as it was.** What moves is the undated recurring costs, so the
  form that changes it says which ones will follow, names the chosen scenario whose cost will move
  with them, if any, and the summary recalculates. Shifting the
  assignments with it would be a separate, explicit action, not part of v0.3.
- **Its dates follow the calendar's rules** (rule h): inside the listed years, start not after end.

**Existing projects get none.** A migration cannot derive one: the project span belongs to each
scenario, and different scenarios of one project have different spans, so any value would change
the cost of some scenario without anyone asking. Their results stay exactly as they are until
someone sets a planned period.
The demo seed plans one on Internal tooling ([The demo's dates](#the-demos-dates)).

The description is 1 to 500 characters, not blank, and holds no money, so everyone who sees the
project sees it.

## Comparing scenarios

From v0.4 a project's scenarios can be compared side by side, to answer «which team suits this
project better?» before choosing one. A comparison is a view, not data: nothing is stored, and it is
read again on every request. It is one pure function in `src/lib/comparison`, over the results the
scenario page already gets.

### What can be compared

- **Two or three scenarios of the same project**, each once. Scenarios of different projects are
  never compared: each margin % is over its own revenue (rule f), and their prices are unrelated.
- **The chosen scenario may sit next to drafts.** It is costed as its page costs it, with its frozen
  values (rule b), and the drafts with the current ones; the comparison says which column uses frozen
  values, since part of a difference may come from rates changed after choosing.
- **A scenario without assignments** may be compared: its lines are what the engine gives it.
- **Target margin** is the organization's current one for every column (rule b), so the margin
  statuses are judged against the same goal.

### The baseline

The first column is the **baseline**: the chosen scenario when it is among those compared, or else
the first one picked. The other columns show their figures and, for each line, the **difference**
from the baseline: that column's value minus the baseline's. The baseline only orders the columns
and signs the differences: it never changes a figure.

### What it shows

With rate access, for each scenario, the summary's result lines and the differences between them:

| Line                                                       | Difference                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Staff cost of each category                                | In cents. A category absent from a team counts as 0 € and 0 hours there                |
| Staff cost                                                 | In cents                                                                               |
| Extra costs                                                | Their sum, in cents: the sum of each extra cost's rounded line, undetermined if any is |
| Direct cost, overhead, buffer, total                       | In cents                                                                               |
| Revenue                                                    | In cents. With a fixed price it is the same price in every column: a 0 € change        |
| Direct and net margin, with their %                        | Margins in cents; their % in percentage points, from their basis points                |
| Margin status                                              | None: each column shows its own status                                                 |
| Effective rate                                             | In cents per hour                                                                      |
| Nominal and effective hours, per scenario and per category | In hours, exact                                                                        |

- **Categories** are listed once, as the union of the teams: the baseline's in its order, then the
  others' new ones in the order they first appear. A category absent from a team shows «not on this
  team», never 0 €; for the difference it counts as 0, so the difference is the other column's whole
  amount.
- **Each extra cost** is listed in its column by label and kind, without a difference: extra costs
  belong to their scenario (another team may need other infrastructure), so two scenarios' extra
  costs are not the same cost even when their labels match. Their sum has a difference.
- **Small categories** keep their warning next to their staff cost in every column (rule j,
  [Small categories](#small-categories)): a difference between two columns can reveal a salary as
  well as the cost itself.
- **Differences are exact:** every result line is already rounded to the cent, so a difference of two
  of them is exact and never rounded again. A difference of 0 is shown as no change, not hidden.
- **Effective rate** comes first with a fixed price: revenue is the same in every column, so it is
  the figure that tells the teams apart (revenue ÷ effective hours). In T&M revenue moves with the
  team, and net margin is the figure to read.

Everyone, with or without rate access, sees **the team differences**, which hold no money:

- **People:** a person in a column and not in the baseline **enters**; a person in the baseline and
  not in a column **leaves**; a person in both shows the changes to their category, project role,
  allocation, weekly hours and dates, if any. People are matched by person, never by assignment id,
  since a duplicated scenario gives its assignments new ids.
- **Open roles** cannot be matched one by one: they are compared per category, as how many open roles
  each column has and their nominal hours.
- **Hours** per scenario and per category, nominal and effective, with their differences.

Without rate access the comparison shows only that: teams and hours, never a result line, a margin
status, an effective rate or a difference in money (rule j,
[ADR 0005](adr/0005-rate-access-in-the-database.md)).

### Partial results in a comparison

A figure keeps its state ([Partial results](#partial-results)): an undetermined line is shown as
undetermined in its column, with what is missing, and a line not applicable as not applicable.

- **A difference needs both figures.** When the line is undetermined or not applicable in the column
  or in the baseline, there is no difference, never one computed from 0 or from a subtotal. The
  difference cell says which column lacks the figure.
- **A category absent from a team is not undetermined:** it counts as 0 (see above). A category
  present without a rate is undetermined, and so is its difference.
- **Hours are always determined**, so their differences always exist.

### Comparison examples

These become the unit tests of `src/lib/comparison`. All three scenarios belong to the guide case's
project (fixed price of 200,000 €, 1 April to 29 September 2027, cloud at 1,000 € a month without
dates, 1,984 calendar working hours, target margin 25%), and every assignment is at 40 hours a week:

- **Plan A**, the guide case and the chosen scenario: Project Manager 50%, Senior Developer 100%,
  Frontend Developer 100%, DevOps Engineer 50%.
- **Plan B:** Plan A with a Junior Developer at 100% instead of the Frontend Developer.
- **Plan C:** Plan A without the DevOps Engineer.

Plan A is the baseline, since it is chosen. Differences are from it:

| Line                |               Plan A |               Plan B |              Plan B − A |                Plan C |               Plan C − A |
| ------------------- | -------------------: | -------------------: | ----------------------: | --------------------: | -----------------------: |
| Staff cost          |         105,318.35 € |          95,017.95 € |            −10,300.40 € |           87,364.72 € |             −17,953.63 € |
| Extra costs (cloud) |           5,966.67 € |           5,966.67 € |                     0 € |            5,966.67 € |                      0 € |
| Direct cost         |         111,285.02 € |         100,984.62 € |            −10,300.40 € |           93,331.39 € |             −17,953.63 € |
| Overhead            |          15,797.75 € |          14,252.69 € |             −1,545.06 € |           13,104.71 € |              −2,693.04 € |
| Buffer              |          12,708.28 € |          11,523.73 € |             −1,184.55 € |           10,643.61 € |              −2,064.67 € |
| Total cost          |         139,791.05 € |         126,761.04 € |            −13,030.01 € |          117,079.71 € |             −22,711.34 € |
| Revenue             |         200,000.00 € |         200,000.00 € |                     0 € |          200,000.00 € |                      0 € |
| Direct margin       | 88,714.98 € (44.36%) | 99,015.38 € (49.51%) | +10,300.40 € (+5.15 pp) | 106,668.61 € (53.33%) |  +17,953.63 € (+8.97 pp) |
| Net margin          | 60,208.95 € (30.10%) | 73,238.96 € (36.62%) | +13,030.01 € (+6.52 pp) |  82,920.29 € (41.46%) | +22,711.34 € (+11.36 pp) |
| Margin status       |                green |                green |                         |                 green |                          |
| Effective hours     |              2,437.5 |              2,437.5 |                       0 |              2,031.25 |                  −406.25 |
| Effective rate      |            82.05 €/h |            82.05 €/h |                   0 €/h |             98.46 €/h |               +16.41 €/h |

- **Categories:** Project Manager, Senior Developer, Frontend Developer and DevOps Engineer in
  Plan A's order, then Junior Developer, new in Plan B. In Plan B the Frontend Developer is «not on
  this team» and its difference is −30,413.71 €; the Junior Developer is not on Plan A's team and
  its difference is +20,113.31 €. In Plan C the DevOps Engineer's difference is −17,953.63 €.
- **Effective rate:** Plan B has the same hours as Plan A, so the same effective rate, although it
  costs 13,030.01 € less; Plan C has 406.25 fewer effective hours, so each hour of the same price is
  worth 16.41 € more.
- **Team:** in Plan B the Frontend Developer's person leaves and the Junior Developer's enters; in
  Plan C the DevOps Engineer's person leaves. Without rate access these team differences and the
  hours are all the comparison shows.
- **Partial result:** in an organization where the Junior Developer has no rate, Plan B's Junior
  Developer line, staff cost, direct cost, overhead, buffer, total cost and both margins are
  undetermined, with «Falta el coste de Junior Developer», and none of them has a difference.
  Revenue (the fixed price), the extra costs and the effective rate stay determined, with their
  differences of 0; so do the hours. Plan B's margin status is none. Plan C, which does not use
  the Junior Developer, is unchanged.

## Weekly load

From v0.4 the editor shows how busy each person is **week by week**, and flags over-allocation
(rule c), the first health check. It extends [How busy a person is](#how-busy-a-person-is), which
stays as today's figure, from a single day to the weeks of a scenario. It is one pure function in
`src/lib/load`, over assignments and dates: it holds no money, so everyone sees it.

**Load is what Squadio knows.** It comes only from the scenarios registered here: a week without
load means nothing is registered for that person, never that they are free. The UI says so wherever
it shows load.

### Which scenarios load a person

For the scenario on the page, being edited or only viewed:

- **That scenario**, whether chosen or not.
- **The chosen scenario of every other project** (rule i keeps it to one per project). From v0.5's
  slice 6 that is its chosen revision's team, not its saved one
  ([Choosing a revision](#choosing-a-revision)). A revision's page shows the load it stored, not
  today's.
- **Never two scenarios of the same project:** they are alternatives, not extra work. The project's
  own chosen scenario does not count when another of its scenarios is on the page; that one stands in
  for it. A chosen scenario on the page counts once.
- **Nothing else:** scenarios that are not chosen, other than the one on the page, commit no one.
  Open roles load no one, since they have no person. An assignment at 0% loads nothing.

### What a week is

A week is an ISO week, Monday to Sunday, in `Europe/Madrid`, like every date in Squadio. Its
**working days** are those of the national calendar (rule h): weekdays that are not national
holidays, so most weeks have 5 and a week with a holiday on a weekday has fewer. The days of the
week before 1 January 2026, the calendar's first listed day, are weekdays without a national holiday
(29 to 31 December 2025), so they count as working days of that week, although no assignment can
cover them.

### Load in a week

An assignment loads a week in proportion to the working days of that week it covers:

```math
\text{load}_{\text{assignment, week}} = \text{allocation} \times \frac{\text{workingDays}(\text{assignment} \cap \text{week})}{\text{workingDays}(\text{week})}
```

A person's load in a week is the sum over the assignments that load them (see above). It is a
percentage, kept exact as a fraction, and may exceed 100%.

- **Allocation, not hours:** load sums allocations, as today's occupancy does. An assignment's weekly
  hours, which may differ from the person's (rule a), do not change it.
- **A week without working days** carries no load, and nothing to judge.
- **Partial weeks** are what the proportion is for: an assignment at 100% that ends on a Wednesday
  and the next one at 100% that starts on the Thursday load that week 100%, not 200%.

**A week is over-allocated** when the person's exact load is above 100%. The display rounds the load
to a whole percent, half up; an over-allocated week whose load would round to 100% shows «>100 %»,
so an over-allocated week never reads 100%.

### Where it shows

- **On the bench**, each active person has a strip of weeks with their load, over the weeks of the
  scenario on the page: from the week of the earliest of its first assignment start and the project's
  planned start to the week of the latest of its last assignment end and the planned end. A scenario
  without assignments, of a project without a planned period, has no weeks, and the bench shows only
  today's occupancy, as before.
- **On the team** (canvas and table), an assignment with a person is flagged when that person is
  over-allocated in at least one week the assignment covers, a week with at least one of its working
  days. The flag lists those weeks, each with the load and the projects whose chosen scenarios add
  to it, by name: the first four, and how many more, so a long project stays readable (decided on
  2026-11-19). The table, which has no room for them, shows how many weeks and gives the sentence to
  screen readers; the tree's card shows it on hover and focus, and the bench lists every week. It
  is a warning, never a block: the change is still accepted and saved.
- **Inactive people** keep loading the weeks of their assignments, since a chosen scenario still
  commits them; they are not on the bench, but their assignments on the team are still flagged.

The flag names projects, never costs, and judges the team's structure, never the person
([ADR 0003](adr/0003-structure-not-people.md)).

### Load examples

These become the unit tests of `src/lib/load`. One person, all assignments at their 40 hours a week,
dates in 2027. «X» and «Y» are two projects; the scenario on the page belongs to Y.

| Case                  | Assignments                                                                                      | Week                         | Load                                                                 | Over-allocated |
| --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- | -------------- |
| Handover              | X chosen, 100% to Wed 9 June. Y on the page, 100% from Thu 10 June                               | 7–13 June (5 working days)   | 100% × 3/5 + 100% × 2/5 = **100%**                                   | No             |
| Overlap               | X chosen, 100% to Thu 10 June. Y on the page, 100% from Wed 9 June                               | 7–13 June (5)                | 100% × 4/5 + 100% × 3/5 = **140%**                                   | Yes            |
| Holiday               | X chosen, 80% all of October. Y on the page, 50% from Wed 13 October                             | 11–17 October (4: 12 is off) | 80% × 4/4 + 50% × 3/4 = **117.5%**, «118 %»                          | Yes            |
| Rounds to 100%        | X chosen, 99% all of December. Y on the page, 4% from Fri 10 December                            | 6–12 December (3: 6, 8 off)  | 99% + 4% × 1/3 = **100.33…%**, «>100 %»                              | Yes            |
| Same project (rule c) | Y chosen, 60%. Y's draft on the page, 60%. X chosen, 50%, all in the same weeks                  | any of them                  | 60% (draft) + 50% (X) = **110%**; Y's chosen scenario does not count | Yes            |
| Chosen on the page    | Y chosen and on the page, 60%. X chosen, 50%, in the same weeks                                  | any of them                  | 60% + 50% = **110%**, Y counted once                                 | Yes            |
| Drafts commit no one  | X's draft (not chosen), 100%. Y on the page, 60%, in the same weeks                              | any of them                  | **60%**                                                              | No             |
| Open role             | Y on the page: an open role at 100% of the person's category, and the person at 50% in X, chosen | any of them                  | **50%**: the open role loads no one                                  | No             |

## Revisions

**Rules version: 1.**

From v0.5 a scenario can have revisions: a copy of it, at one moment, that never changes. A shared
link and a choice point at a revision, never at the scenario, so what someone reads or chose stays
what it was while the scenario goes on being edited
([ADR 0013](adr/0013-scenario-revisions.md)). Revisions land in v0.5's slices 1 to 6
([plan](plan.md#v05-slices)); until slice 6 a chosen scenario still freezes as
[What choosing freezes](#what-choosing-freezes) says.

### What a revision holds

Everything its result needs, so it can be read without anything else, in two parts:

- **The open part,** which everyone in the organization reads: the scenario's name, the project's
  pricing model, the team (each assignment's category, person or open role, project role, who it
  reports to, weekly hours, allocation and dates, with the names they had), each assignment's
  nominal and effective hours and their total, and the over-allocation observed that day (rule c):
  each person above 100% in a week, with the week, their load and the projects behind it. It holds
  no money.
- **The restricted part,** which only rate access reads (rule j): the rate of each category the team
  uses (fully loaded annual cost or manual cost per hour, and sell rate), the overhead % and buffer %
  in effect (the project's overrides or else the organization's), both terms of the availability
  factor (net annual hours and calendar working hours), the project's price (the fixed price, or the
  budget cap in T&M, rule e) and planned period, the extra costs, and every result line,
  undetermined ones with what was missing, with the budget cap warning. The planned period
  is here, although a project's is open, because in a revision it only prorates recurring costs.
- **Who and when:** its number within the scenario (1, 2, 3…), when it was made, by whom, and why:
  saved on request, shared or chosen.
- **The rules version** above, and the commit of the build that made it.

**Target margin is not in it.** It is a goal, not a cost (rule b): a revision's margin status is
judged against the organization's current target, so it may change colour while its figures stay.

**A revision is never recalculated.** It shows the result, hours and load it stored, under the rules
version it stored. A revision made under the current rules version gives exactly its stored result
when recalculated from its own inputs; the code holds only the current rules, so older revisions are
only shown, never recalculated. The rules version moves on with any change to this file, or to the
national calendar (rule h, a new year included, since dates outside the calendar use its first
year), that changes a result for the same inputs. The code keeps the same number, and a test checks
they are equal; another pins the results of the guide case and the comparison examples with the
rules version, so a result that moves without the version moving fails.

### When one is made

- **On request:** «Guardar revisión» on the scenario page. It needs rate access, since the
  restricted part is part of it.
- **When the scenario is shared or chosen,** automatically, before the link is given or the choice
  made.
- **Never on a save:** editing a team and autosaving make no revision.

A revision is of the scenario as saved: the page saves what is left to save first. When nothing in
it would differ from the scenario's latest revision (team, names, hours, rates, settings, price,
period, extra costs and rules version alike), no new one is made and the latest is used again. The
load observed is not compared: it comes from other projects' chosen scenarios, so the reused
revision keeps the load known when it was made (rule c). A revision of an empty team may be saved and shared; it cannot be chosen. Visitors cannot share: a
revision's link opens only for signed-in members.

**On a chosen scenario,** sharing gives its chosen revision. «Guardar revisión» makes a revision of
the team as saved, with the current values, and leaves the choice where it was; choosing that new
revision then moves it, as below.

**In the demo** the seed writes one revision of a chosen scenario and one derived alternative, to
show both. A visitor's copy copies them with new ids, like the rest of the template
([ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md)).

### Sharing a revision

A revision's link is `/revisions/<id>`. It opens only for signed-in members of its organization; for
anyone else it does not exist, as another organization's scenario does not. There are no public
links and no exported document in v0.5 ([ADR 0015](adr/0015-roles-and-invitations.md)). The page is
read only. It says which revision it is, who made it and when, whether it is the chosen one, and,
when the scenario has a newer revision, says so and links to the latest, without saying what
changed. With rate access it shows the small category warning (rule j) against today's headcount,
as wherever a rate is read.

**Without rate access** it shows the open part: the team, the dates, the hours and the load. The
database returns no restricted part, so no rate, cost, price, extra cost, margin or margin status.
Effective hours come from the open part, so everyone reads the same hours for a revision, whatever
Config says today.

### Choosing a revision

From slice 6 choosing points at a revision; FrozenRate and FrozenCostConfig are retired.

- **Choosing a scenario** chooses its latest revision, made first if none matches it (see above).
- **Choosing another revision** of a scenario, chosen or not, moves the choice to it. When it is
  not the scenario's latest, or was not made just now, it first lists what changed since it was
  made, and asks to confirm:
  - **The team:** the scenario has been saved since with a different team; that team is kept, and
    is what the editor shows again if the revision is unchosen.
  - **Load:** people who are over-allocated now in the revision's weeks but were not then, or the
    other way round (rule c), against today's chosen scenarios of other projects.
  - **Rates:** each category of the team whose cost or sell rate now differs, then and now.
  - **The project's conditions:** price, planned period, pricing model and the overrides of overhead
    and buffer.
  - **The rules version,** when the revision's is older than the current one.

  Nothing in the list blocks choosing: the revision keeps the values it was made with.

- **What reads the chosen revision:** the scenario page, Inicio, the comparison and the weekly load
  of other projects all read a chosen scenario's chosen revision, its result and its team, not its
  saved team and current values. Its team cannot be edited while it is chosen, as today.
- **Unchoosing** removes the pointer only: the revision stays, and so do the others.
- **Rules that block choosing are today's:** rate access, no undetermined staff cost (a category
  without a rate, rule k), and a team that is not empty
  ([Choosing a scenario](#choosing-a-scenario)). Choosing the revision already chosen is refused as
  changing nothing.

### Derived alternative

«Proponer alternativa» on a revision makes a new draft scenario of the same project, from the
revision's team and extra costs, as duplicating does from a scenario
([Duplicating a scenario](#duplicating-a-scenario)): new ids, the same team tree, people as they
are, costed with the current values, at most 20 scenarios per project, and rate access needed. It
records the revision it came from and who made it, and opens in the editor. Its name is the
scenario's followed by « (alternativa)» (« (alternative)» in English), numbered like a copy's. The
revision and its scenario never change: an alternative is a proposal next to them, which can be
compared, shared and chosen like any scenario. A person deactivated or moved to another category
since the revision stays on the alternative, as on a copy; a category without a rate today leaves
its line undetermined (rule k), since the alternative is costed with the current values.

### Retention

A revision lives as long as its scenario: deleting the scenario, its project or the organization
deletes its revisions, and a derived alternative then keeps that it came from a deleted revision.
Deleting an account leaves its revisions and alternatives without an author, shown as «antiguo
miembro». No revision is deleted on its own, and none is ever updated.

### Revision examples

These become the tests of `src/lib/revisions` and of the revision slices. Plan A is the guide case's
team, Plan B Plan A with a Junior Developer at 100% instead of the Frontend Developer, as in the
[comparison examples](#comparison-examples): fixed price of 200,000 €, target margin 25%. Each case
starts from revision 1 of Plan A, saved as the first row says while Plan A is a draft, unless it
says otherwise.

| Case                | What happens                                                                                   | Revision                                                                                   | Scenario or other result                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Saved               | «Guardar revisión» on Plan A                                                                   | Revision 1: total cost 139,791.05 €, net margin 60,208.95 € (30.10%), green, 2,437.5 hours | Plan A unchanged                                                                       |
| Nothing changed     | Plan A is shared right after                                                                   | Revision 1 is used again: its link is shared                                               | No revision 2                                                                          |
| Rates change        | The Senior Developer's fully loaded annual cost goes up                                        | Revision 1 still costs 139,791.05 €                                                        | Plan A, a draft, costs more                                                            |
| Target changes      | The organization's target margin goes from 25% to 35%                                          | Revision 1 still has a net margin of 30.10%, now amber                                     | Plan A amber too                                                                       |
| Config changes      | Net annual hours change in Config                                                              | Revision 1 still has 2,437.5 effective hours, with and without rate access                 | Plan A's hours move                                                                    |
| Without rate access | A viewer opens revision 1's link                                                               | Team, dates, 2,437.5 effective hours and the load; no money                                |                                                                                        |
| Derived alternative | A member proposes an alternative from revision 1 and swaps the Frontend Developer for a Junior | Revision 1 unchanged                                                                       | «Plan A (alternativa)», derived from revision 1, costs 126,761.04 €, as Plan B         |
| Old revision chosen | Plan A is edited and saved without the DevOps Engineer; then revision 1 is chosen              | Revision 1 is chosen, with its 139,791.05 €; the check lists the team saved since          | Plan A's saved team, without the DevOps Engineer, comes back if revision 1 is unchosen |
| Price changes after | Revision 1 is chosen; then the project's price becomes 210,000 €                               | Revision 1 still has revenue of 200,000 € and a net margin of 60,208.95 €                  | Choosing a new revision of Plan A gives the new price; the check would list the price  |
| Rules move on       | A change to this file moves the rules version to 2                                             | Revision 1 keeps its result and rules version 1                                            | Choosing it now lists the older rules version                                          |
| Unchosen            | Revision 1 is unchosen                                                                         | Revision 1 stays                                                                           | The project has no chosen scenario                                                     |

## Configuration per organization

Each organization creates its own categories and sets every number. A salary can be entered per year
or per month with the number of payments, 12 or 14 (2,100 €/month × 14 = 29,400 €/year).

From v0.3 a signed-in member with rate access creates and edits categories on any project's page
(«Categorías y costes»), since they belong to the organization, not to the project. A category is
created with its whole rate: name, salary, social security %, other yearly costs, an optional manual
cost per hour and its sell rate; a new one starts with the template's 31% and 3,000 €. Editing a
rate costs every scenario that is not chosen with it at once; chosen ones keep what they froze
(rule b). A category without a rate, which the editor never creates but an older organization may
hold, shows as pending (rule k), and editing it gives it one. Its cost and sell rate are written
together, so "Pendiente" always means both are missing.

Without rate access the card does not show: which categories lack a rate is itself restricted.
Deleting a category is not offered yet. From v0.3 an
organization starts empty, with the Consultancy template's Config and CostConfig and no categories,
or as a member's adopted visitor's copy ([ADR 0012](adr/0012-sign-in-and-membership.md)). Example
scenarios to start from come in v0.6; templates for other sectors wait for evidence.

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
and cloud at 1,000 € a month with no dates of its own, so it spans the project (the seed sets no
planned period, so these figures stay pinned). Calendar working
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
- Filling in a partial result's missing rates, price and planned period never changes a line it had
  determined, nor its hours.

And on random sequences of changes, undo, redo and saves (see
[Editing a scenario](#editing-a-scenario)):

- An accepted change never leaves a cycle or the same person twice.
- Applying an accepted change's inverse gives back exactly the team before it, unless it places
  again a person who is now inactive or in another category, and then it is rejected.
- Applying what is left to save to the last saved team gives exactly the current team.

And on random names, for [duplicating a scenario](#duplicating-a-scenario): the copy's name is
always one the project does not have, within 100 characters. A DB test checks that a non-chosen
scenario and its copy give the same cost and margin, with the same team tree.

And on random scenarios, for [revisions](#revisions): recalculating a revision from its own inputs,
under its rules version, gives exactly its stored result, and its open part holds no money.

## Out of scope for v1

Productivity by seniority and cost per deliverable, real availability and skills beyond
over-allocation, schedule effects (more people do not always finish sooner), and a hidden per-person
cost adjustment. The model can take each of them by adding a field.
