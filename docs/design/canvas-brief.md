# Design brief: the scenario canvas

What the main screen of Squadio shows and how it behaves: the read-only canvas of v0.1, shaped so
the drag-and-drop editing of v0.2 fits later without a redesign. It is the input for the visual
proposal and for the `feat/scenario-read-page` slice. Terms follow the [glossary](../glossary.md);
the numbers follow [domain.md](../domain.md).

> **Chosen direction:** A · Ledger rail, chosen by the owner on 2026-10-21 (see
> [Visual directions](#visual-directions)).

## Goals and limits

- **One screen, one scenario.** `/scenarios/[id]` shows one scenario of one project: its team tree
  and, for users with rate access, its cost, revenue and margin.
- **Read-only in v0.1.** Nothing is edited, but every element already has the place its v0.2 action
  will need (see [What changes in v0.2](#what-changes-in-v02)).
- **Structure, not people** ([ADR 0003](../adr/0003-structure-not-people.md)). Nodes show roles,
  categories, allocation and hours. Money is shown per category and per scenario, never per person.
- **The money is not there, not hidden** ([ADR 0005](../adr/0005-rate-access-in-the-database.md)).
  Without rate access the server sends no money at all, so the layout must look complete without it,
  not like a page with blanks.
- **Desktop first.** Editing is desktop-only; on narrow screens the page is read-only anyway, and
  the table view is the default below `md`.

## Screens

There is one route with two views of the same data, plus the summary.

### 1. Header

| Element         | Content                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| Breadcrumb      | Organization › Project (client) › Scenario                                       |
| Scenario name   | With a "Chosen" badge when it is the chosen scenario (rates frozen, rule b)      |
| Pricing model   | "Fixed price" or "Time and materials"                                            |
| Project span    | First assignment start – last assignment end, and the working days in between    |
| View switch     | "Tree" / "Table", a segmented control (`radiogroup`); the choice is in the URL   |
| Theme           | System, light, dark                                                              |
| Reserved (v0.2) | Undo, redo and a save state indicator, right-aligned; absent in v0.1, not greyed |

### 2. Tree view (the canvas)

The team tree built from "reports to", drawn with React Flow and the compact layout of
[ADR 0008](../adr/0008-simulator-interaction-stack.md): the root (normally the project manager) on
top; a node with more than two leaf children stacks those leaves in one column, with edges entering
from the left. Fits a 25-person team at about 66% zoom.

- **Node card** (fixed width, about 240 px, so the layout stays a pure function of the tree):
  - Line 1: project role ("Tech lead") — or the category when the role is empty.
  - Line 2: the person's name, or **Open role** with a dashed border and a distinct icon.
  - Line 3: category chip.
  - Line 4: allocation % and weekly hours ("50% · 20 h/wk"), dates when they differ from the
    project span.
  - Footer: effective hours for the assignment ("520 h effective"), nominal hours in the tooltip
    and in the table.
  - **No money on nodes.** A node is a person or a role; money stays on categories.
- **Canvas controls:** zoom in, zoom out, fit view, as buttons with names. React Flow's attribution
  stays (hiding it needs a paid plan).
- **Selection:** clicking or focusing a node highlights it and its path to the root, and selects the
  same row in the table view. In v0.1 there is no side panel; the tooltip is enough.

### 3. Table view (the accessible view)

The same team as an ARIA `treegrid`: one row per assignment, indented by depth, rows expand and
collapse. It is a first-class view, not a fallback: it is the default on narrow screens and the
one screen readers get.

| Column             | Everyone | Rate access only |
| ------------------ | :------: | :--------------: |
| Role               |    ✓     |                  |
| Person / Open role |    ✓     |                  |
| Category           |    ✓     |                  |
| Reports to         |    ✓     |                  |
| Allocation %       |    ✓     |                  |
| Weekly hours       |    ✓     |                  |
| Start – end        |    ✓     |                  |
| Nominal hours      |    ✓     |                  |
| Effective hours    |    ✓     |                  |

The table has no money column either: per-category cost lives in the summary. Footer row: totals
of nominal and effective hours.

### 4. Summary (cost, revenue and margin)

Only rendered with rate access. Without it, its place shows the hours summary (see
[States](#states)).

- **Headline:** net margin % and net margin €, with the **margin status**: green at or above the
  target, amber below it, red with a negative net margin, none without revenue. Status is a
  coloured badge **with an icon and a word** ("On target", "Below target", "Loss"), never colour
  alone. The target margin is shown next to it ("target 25%").
- **Key figures:** revenue, total cost, effective rate (€/h), effective hours.
- **Result lines**, in the order of the calculation, each rounded once as the engine returns them:
  staff cost, each extra cost, direct cost, overhead (with its %), buffer (with its %), total cost,
  revenue, direct margin (with %), net margin (with %).
- **Staff cost by category:** one line per category in the scenario with effective hours, cost per
  hour and cost. The small-category warning (rule j) sits on this line.
- **T&M budget cap:** when set and exceeded, a warning with revenue versus cap (`budgetCapExceeded`).
- Numbers use tabular figures, right-aligned, formatted by next-intl (`es-ES`: `139.791 €`,
  `30,1 %`). The summary shows whole euros; the engine's cents stay in the data and appear where
  exact figures matter (tooltips, a future export). This is formatting only, never a second rounding
  in the calculation. CLDR does not group four-digit numbers in Spanish (`5967 €`, not `5.967 €`);
  that is correct, not a bug.

Guide case, as the mockups show it (fixed price 200,000 €, 1 April to 29 September 2027):

| Line                                 |                  Amount |
| ------------------------------------ | ----------------------: |
| Staff cost (2,437.5 effective hours) |               105,318 € |
| Cloud                                |                 5,967 € |
| Direct cost                          |               111,285 € |
| Overhead (15%)                       |                15,798 € |
| Buffer (10%)                         |                12,708 € |
| Total cost                           |               139,791 € |
| Direct margin                        |        88,715 € (44.4%) |
| Net margin                           | 60,209 € (30.1%), green |
| Effective rate                       |               82.05 €/h |

## Data each element needs

The server builds one of two payloads (ADR 0005: the app does not send what the user cannot see).
Everything in the open payload comes from open tables; the restricted payload is computed by
`calculateScenario` and only exists with rate access.

| Element                                  | Source                                                       | Payload    |
| ---------------------------------------- | ------------------------------------------------------------ | ---------- |
| Organization, project name, client       | Organization, Project                                        | Open       |
| Pricing model (fixed or T&M)             | Project                                                      | Open       |
| Scenario name, chosen                    | Scenario                                                     | Open       |
| Node: role, person, category, reports to | Assignment, Person, Category                                 | Open       |
| Allocation, weekly hours, dates          | Assignment                                                   | Open       |
| Nominal and effective hours              | Calendar + Config (current Config, see note)                 | Open       |
| Project span, working days               | Assignments + calendar                                       | Open       |
| Price, budget cap                        | ProjectPricing                                               | Restricted |
| Every result line, margins, status       | `calculateScenario` over CategoryRate, CostConfig, ExtraCost | Restricted |
| Effective rate                           | `calculateScenario`                                          | Restricted |
| Target margin                            | CostConfig                                                   | Restricted |
| Staff cost by category, cost per hour    | CategoryRate + hours (see open question 1)                   | Restricted |
| Missing rate warning (rule k)            | `calculateScenario` (`missingRate`)                          | Restricted |
| Small-category warning (rule j)          | Active people per category (`src/lib/rates`)                 | Restricted |
| Extra cost labels                        | ExtraCost                                                    | Restricted |

Note: without rate access, a chosen scenario's effective hours use the current Config, since its
FrozenCostConfig is restricted (domain.md, "What choosing freezes"). The hours can differ slightly
from what a manager sees after Config changes; the UI does not explain this to users who cannot
see why.

The headcount behind rule j is not money, but the warning only matters next to a cost, so it ships
in the restricted payload.

## States

| State                       | Who sees it | What the screen does                                                                                                                                                                                                                                                                                |
| --------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full** (rate access)      | Rate access | Tree or table + summary with status                                                                                                                                                                                                                                                                 |
| **No rate access**          | Without it  | No euro sign anywhere. The summary place shows **team and hours**: people, open roles, nominal and effective hours, project span. No locked padlocks, blurred numbers or "upgrade" hints: nothing suggests a hidden figure. A single neutral line says costs are visible to people with rate access |
| **Missing rate** (rule k)   | Rate access | The scenario is incomplete: the summary shows a warning naming the categories without a rate, and **no cost, revenue-derived margin or status** — every money figure is replaced by "—" with the reason, never 0 €. Nodes of those categories carry a small warning marker in both views            |
| **Small category** (rule j) | Rate access | A warning icon with text ("Small category: its rate can reveal a salary") on that category's line in "Staff cost by category". The cost is still shown. Nothing on the nodes                                                                                                                        |
| **Empty scenario**          | Everyone    | No assignments: the canvas shows an empty state with a short explanation ("This scenario has no team yet"). In v0.2 this becomes the first drop target. With rate access, the summary shows the price (fixed) and no status; an undated recurring cost there is a validation error, shown as such   |
| **Open roles**              | Everyone    | Dashed node with "Open role", the category and the allocation. They count for hours and cost like any assignment. Summary shows "N open roles"                                                                                                                                                      |
| **No revenue**              | Rate access | T&M with sell rate 0, for example: no margin %, no status unless the net margin is negative (then red)                                                                                                                                                                                              |
| **Budget cap exceeded**     | Rate access | Amber warning in the summary: revenue versus cap. It is not the margin status                                                                                                                                                                                                                       |
| **Chosen scenario**         | Everyone    | "Chosen" badge. With rate access, a note that rates are frozen at the choice date. Status is still judged against the current target (rule b)                                                                                                                                                       |
| **Loading**                 | Everyone    | Suspense skeletons with the final layout's shape (header, canvas, summary), so nothing jumps                                                                                                                                                                                                        |
| **Not found / no access**   | Everyone    | Next.js `not-found` with a link back; never a page that says the scenario exists                                                                                                                                                                                                                    |

Warnings follow one pattern everywhere: icon, short title, one line of explanation, in the warning
colour with its contrast checked. Status and warnings are announced to screen readers as text,
not conveyed by colour.

## Keyboard and focus

- **Tab order:** header → view switch → canvas (or table) → summary. One tab stop for the whole
  tree; arrows move inside it (roving `tabindex`).
- **Tree view:** ↑ parent, ↓ first child, ← / → previous and next sibling, Home root, Enter opens
  the node's menu (v0.2), Escape returns focus to the canvas. Focused node scrolls into view.
  `+`, `-` and `0` zoom and fit.
- **Table view:** WAI-ARIA treegrid keys: ↑ ↓ rows, → expand or enter cells, ← collapse or go to
  parent, Home / End.
- **Focus ring:** 2 px outline with offset, visible on every surface in both themes (≥ 3:1 against
  the canvas and the node).
- **Switching views keeps the selection:** the node focused in the tree is the row focused in the
  table, and the reverse.
- **Focus manager (v0.2):** after add, move or remove, focus goes to the affected node or its
  parent (spike finding); v0.1 already routes focus through one place so v0.2 extends it.
- **Reduced motion:** no tweens on re-layout; v0.1 has none anyway.

## Themes and contrast

- Light and dark themes from the shadcn tokens, following the system with a manual override.
- **Contrast targets:** text 4.5:1, large text and UI components (borders of open roles, icons,
  focus ring, status badges) 3:1, in both themes, checked with axe in E2E.
- **The spike's trap:** shadcn's default `muted-foreground` on `muted` is 4.34:1 in light and fails
  AA. Secondary text never sits on `muted` with the default token: either darken
  `muted-foreground` (about `oklch(0.50 0 0)` or darker in light) or keep secondary text on
  `background` / `card` only. The mockups list each token pair they use with its ratio.
- **Status colours** (green, amber, red) are new tokens (`--status-ok`, `--status-warn`,
  `--status-bad`) each with a foreground pair, defined for both themes and never the only signal.
- Canvas background: a subtle dot grid, lighter than any border. Plain node borders are decoration
  (the card has a shadow too); the dashed border of an open role carries meaning, so it keeps 3:1
  against the canvas.

## Text and locale

- Every string goes through next-intl, including aria labels, tooltips, empty states and the
  status words. Spanish (`es`) and English (`en`) message files from the start.
- Numbers, money, percentages and dates use next-intl's formatters with the locale; money from
  integer cents, percentages from basis points. No string concatenation for figures.
- Pluralised counts ("1 open role", "3 open roles") through ICU messages.
- Names in mockups, seeds and screenshots are synthetic.

## What changes in v0.2

v0.1 must leave room for these without moving anything:

| v0.2 feature                  | What v0.1 reserves                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bench** (left panel)        | The page grid has a left column; in v0.1 it is collapsed to zero, not absent from the design. The summary is never on the left             |
| **Drag from bench to canvas** | Nodes have a drop-target highlight style (designed now, unused); the canvas has an empty-canvas drop zone (the empty state)                |
| **Move inside the tree**      | Node cards have a grip area at the left edge and a "…" menu button slot top-right, both hidden in v0.1                                     |
| **Keyboard parity**           | "Add to team…" / "Move to…" / "Remove" live in the node's menu; Enter on a focused node opens it. The table rows get the same menu         |
| **Undo / redo**               | Header slot right-aligned, with ⌘Z / ⇧⌘Z. The live region that announces summary changes exists in v0.1 (silent, the data does not change) |
| **Live recalculation**        | Summary figures animate their change with Motion (count, not bounce); reduced motion swaps instantly                                       |
| **Optimistic locking**        | A save state indicator in the header ("Saved", "Saving…", "Changed elsewhere — reload")                                                    |
| **Choose scenario**           | A primary action in the header, rate access only                                                                                           |
| **Comparison (v0.3)**         | The summary is a self-contained component that can be placed two or three times side by side                                               |

## Open questions

1. **Staff cost by category.** `calculateScenario` returns staff cost as one line. Showing cost per
   category needs either a new result line per category from the engine (and a decision on how
   they relate to the rounded total: each rounded once, and the total stays the engine's) or a
   separate pure function. domain.md must say it first.
2. **Rule j's branch** (`docs/salary-leak-warning`) is not merged yet; this brief follows it (1 or
   2 active people in the organization).
3. **Locale default:** `es` for the demo organization, `en` for the public README screenshots?

## Visual directions

Three directions, published as interactive HTML mockups (private artifact, shared with the owner):
<https://claude.ai/artifact/FfEXg6yfok6xs8CargtT8A>. Each one renders in light and dark, in every
state above, in tree and table view, with a toggle that outlines the slots reserved for v0.2, and a
table of measured contrast ratios for its tokens. All pairs pass (text 4.5:1, UI 3:1) in both
themes. The data is the guide case; the open-role state adds a Junior Developer at 50%, which takes
the net margin to 23.7%, below the 25% target (amber).

| Direction            | Layout                                                                                                                             | For                                                                                                | Against                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **A · Ledger rail**  | Tree in the centre, summary in a fixed right rail read top to bottom like a statement; zinc neutrals                               | Closest to stock shadcn; leaves the left free for the v0.2 bench; v0.3 compares rails side by side | Takes about 330 px from the canvas                                                                                                  |
| **B · Figures band** | A band of key figures over a full-width canvas; result lines and categories in a strip below; cool slate                           | Widest canvas; figures before the team                                                             | The band needs a second design without rate access; the strip falls below the fold on 13" laptops; comparison needs another pattern |
| **C · By category**  | Each category has a colour and a monogram, repeated on nodes, legend and a stacked cost bar; status pill in the header; warm stone | Makes "cost per category, never per person" visible; monograms work without colour                 | Five category hues per theme to keep at 3:1; breaks down past about 8 categories; more custom design                                |

**Chosen: A · Ledger rail** (owner, 2026-10-21). The tree takes the centre, the summary lives in a
fixed right rail, and the left column stays free for the v0.2 bench. Its tokens are stock shadcn
zinc with two changes: a darker `muted-foreground` that passes AA on `muted`, and the three status
token pairs. B and C stay here as the record of what was considered.
