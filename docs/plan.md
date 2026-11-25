# Plan

Squadio is a staffing simulator for consultancies. When a new project comes in, you build candidate
teams by dragging people or open roles into a scenario and see cost, margin and effective hourly
rate update live, before you commit. Simulating your own company is just another project.

## Who it is for

The consultancy or company that has to decide which team takes a project, and at what price.
Managers and directors see rates, costs and margins; everyone else sees projects and teams only.
Consultancies come first; startups estimating internal work without revenue are a later segment,
still to be checked with users.

## Main screen

- **Bench** (left): the organization's people grouped by category, with how busy each one is.
- **Scenario team** (right): a tree (project manager on top, team below). Drop people or open roles
  on it; cost, margin and the margin status recalculate on every move.
- **Comparison (v0.4):** two or three scenarios of the same project side by side.
- **Accessible view:** the same data and the same actions as a tree or table that works with the
  keyboard and screen readers.

## Roadmap

Every version ships something that can be shown. v0.1 shipped on 2026-10-26
([handoff 0011](sessions/0011-read-only-canvas.md)), v0.2 on 2026-10-29
([handoff 0017](sessions/0017-seed-dates-daily-reseed-and-v02.md)), v0.3 on 2026-11-16
([handoff 0028](sessions/0028-v03-release.md)), v0.4 on 2026-11-19
([handoff 0029](sessions/0029-v04-release.md)) and v0.5 on 2026-11-24
([handoff 0030](sessions/0030-v05-release.md)), with sign-up still closed in production.

After v0.2 the owner reviewed the product's UX and its definition, and the roadmap was planned
again on 2026-10-29. The review lives in a private repository (`utity-tools/squadio-research`,
commit `24b53fd`); what it decided is written here, in [the domain](domain.md) and in the ADRs, so
none of it needs that repository to be understood. Its main finding: the job is not only to build a
team but to prepare, compare and share a proposal and then choose, and the first version people can
use for real needs their own data before anything else. No user has been interviewed yet: the
decisions below are the owner's, not evidence of use.

| Version             | Complete path it ships                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1                | Costing engine, with the guide case as the first test. Read-only canvas with seed data                                                                                                                                                                                          |
| v0.2                | Scenarios: drag people and open roles, live cost and margin, undo and redo                                                                                                                                                                                                      |
| Now                 | The home page leads to the demo. The bench says clearly that occupancy is today's. Interviews with consultancy managers: whoever prepares a proposal and whoever receives it                                                                                                    |
| v0.3 · Prepare      | Sign in, create an organization (empty, or from one's visitor's copy), enter its categories with their costs, its people and open roles, create a project with a planned period and a description, and get an estimate that shows what it can compute when some data is missing |
| v0.4 · Compare      | Duplicate scenarios, compare two or three side by side, and see each person's load week by week against the projects registered in Squadio: over-allocation (rule c), the first health check                                                                                    |
| v0.5 · Share        | Revisions that never change, an authenticated link to one, a reviewer who sends back an alternative derived from it, choosing a revision, and the invitations sharing needs                                                                                                     |
| v0.6 · Faster start | CSV import with a template, a preview and an all-or-nothing confirm, and a picker of example scenarios                                                                                                                                                                          |
| Later, on evidence  | The other health checks (seniority mix, PM ratio, single points of failure), formal approval, other segments and sectors, and the AI assistant ([ADR 0003](adr/0003-structure-not-people.md))                                                                                   |

### Accepted and proposed

**Accepted** by the owner on 2026-10-29:

- The order above, and that v0.3 is for real use with the organization's own data, not another
  demo. Consultancies first.
- Sign-in with GitHub and Google only, an empty organization or an explicit adoption of the
  visitor's copy as a new organization, and the server resolving membership before any tenant
  query ([ADR 0012](adr/0012-sign-in-and-membership.md)).
- Partial results, the planned period and the project's description, as
  [the domain](domain.md#partial-results) specifies them.
- Chosen scenarios of other projects are the commitments that load a person; nothing else is.
- Merging teams with animation leaves the roadmap. Formal approval waits for evidence.

**Accepted** by the owner on 2026-11-23, for v0.5:

- Revisions that never change ([ADR 0013](adr/0013-scenario-revisions.md)): one snapshot per
  revision in an open and a restricted part, a rules version, choosing that points at a revision
  and replaces the frozen tables, and a derived alternative for a reviewer's proposal.
- A reviewer gets a link only, for signed-in members; an exported document waits. Someone without
  rate access sees structure, hours and dates, never money
  ([ADR 0015](adr/0015-roles-and-invitations.md)).
- Three roles, owner, member with rate access and viewer without it, and invitations by a link the
  owner copies, with no mail provider ([ADR 0015](adr/0015-roles-and-invitations.md)).

**Accepted** by the owner on 2026-11-25, for v0.6:

- The CSV import holds categories with their rates and people, in two files; committed assignments
  of other projects wait for evidence ([ADR 0016](adr/0016-spreadsheet-import.md)).
- A person whose name matches an existing one updates them; an empty cell never erases a value.
- The picker of example scenarios stays in v0.6, last, and starts from a design board the owner
  approves.

**Proposed**, to be decided before the version that needs it:

- Microsoft sign-in, once interviews ask for it.

### Service limits

- **Sign-up for real data stays off in production** until the owner has reviewed how the data is
  processed: the effective terms and regions of Vercel, Neon, Google and GitHub, who can reach the
  data, and what deleting keeps. v0.3's code can reach `main` before that, behind a switch that is
  off in production ([ADR 0012](adr/0012-sign-in-and-membership.md)). v0.3.0 is tagged after the
  review; the owner turns the switch on as a step of their own, when they choose (decided on
  2026-11-16, after the review). A privacy page, OAuth and a delete button are
  not by themselves proof of compliance, and the README will not claim it.
- **The demo stays anonymous and synthetic.** Visitors keep their copy as today
  ([ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md)) and are never asked for real names.
- **"Chosen" keeps today's guarantees only** ([what choosing freezes](domain.md#what-choosing-freezes)).
  It is not a record of an approved result until revisions exist: from v0.5's slice 6 it is a
  record of its result ([choosing a revision](domain.md#choosing-a-revision)), still not an
  approval.
- **Load is what Squadio knows.** A person's load comes from the chosen scenarios registered here;
  an empty week means nothing is registered, not that the person is free.

### v0.6 slices

v0.6 ships in six pull requests or more, tests first, in this order, planned on 2026-11-25. The
rules come first and the reading and checking of a file is pure, so the pages only call it
([importing a spreadsheet](domain.md#importing-a-spreadsheet),
[ADR 0016](adr/0016-spreadsheet-import.md)). The owner's boards 02 and 10 to 13 of 2026-11-05 draw
the import; the picker of example scenarios has no board yet.

| #   | Slice                | Done when                                                                                                                                                                                                                                                                                    |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Rules                | ADR 0016, the domain's import with worked examples, the glossary and these slices. Docs only                                                                                                                                                                                                 |
| 1   | Reading and checking | `src/lib/import` reads a CSV, matches its columns, parses numbers and checks each row into ready, warning or error, with what it will create or update. The domain's examples are unit tests; fast-check checks that a template written and read back gives the same rows                    |
| 2   | Categories           | The import page's four steps for the categories file (boards 10 to 12): the template, matching columns, the review with cells to fix and the error report, and a Server Action that writes every row or none. Reached from «Categorías y costes» and as a third way to start an organization |
| 3   | People               | The people file as the second step and on its own from «Personas» (board 13): updates people by name and creates a missing category without a rate. DB tests cover a viewer refused, another organization untouched and a bad row writing nothing                                            |
| 4   | Example scenarios    | A design board the owner approves first, then the picker it draws                                                                                                                                                                                                                            |
| 5   | v0.6 release         | Handoff, README with new screenshots, tag `v0.6.0`                                                                                                                                                                                                                                           |

### v0.5 slices

v0.5 ships in ten pull requests, tests first, in this order, planned on 2026-11-23. Revisions come
before sharing and choosing them, and choosing is last, since it changes what chosen scenarios
already in production read ([revisions](domain.md#revisions),
[ADR 0013](adr/0013-scenario-revisions.md), [ADR 0015](adr/0015-roles-and-invitations.md)).

| #   | Slice               | Done when                                                                                                                                                                                                                        |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Rules               | ADR 0013 accepted, ADR 0015 on roles and invitations, the domain's revisions with worked examples, and the glossary. Docs only                                                                                                   |
| 1   | Revision snapshot   | `src/lib/revisions` builds a revision's open and restricted parts from a scenario, with their Zod schema and the rules version; a property test checks that recalculating a revision gives its stored result                     |
| 2   | Saving a revision   | The two tables with RLS, the money one restricted, and no update for the app role; «Guardar revisión» and the list of a scenario's revisions on its page                                                                         |
| 3   | Revision page       | `/revisions/<id>`, read only, for signed-in members and visitors: the banner when a newer revision exists, and the view without rate access                                                                                      |
| 4a  | Roles and read only | `capabilitiesFor` maps owner, member and viewer; a viewer's context opens read-only transactions, every Server Action refuses a viewer, the pages offer them nothing to edit, and the database allows one owner per organization |
| 4b  | Invitations         | The members page; the owner invites by email and role, copies the link and can revoke it; the invited account accepts it, once, within 7 days, with a verified matching email                                                    |
| 4c  | Roles and removal   | The owner changes a member's role between member and viewer, and removes a member, both checked again inside the transaction                                                                                                     |
| 5   | Derived alternative | «Proponer alternativa» on a revision makes a draft scenario of the same project, with where it came from and who made it                                                                                                         |
| 6   | Choosing a revision | Choosing points at a revision, with the change check for an older one; existing chosen scenarios get a revision from their frozen rows, and FrozenRate and FrozenCostConfig are retired, then dropped in 6c                      |
| 7   | v0.5 release        | Handoff, README with new screenshots, tag `v0.5.0`                                                                                                                                                                               |

### v0.4 slices

v0.4 ships in five pull requests, tests first, in this order, planned on 2026-11-17 at 7 to 9
working days. The rules come first, so the riskiest slice, the weekly load, starts from settled
decisions: how partial weeks count, where load shows and whether the chosen scenario sits next to
drafts ([comparing scenarios](domain.md#comparing-scenarios), [weekly load](domain.md#weekly-load)).

| #   | Slice                  | Done when                                                                                                                                                                                                                                                                                    |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Rules                  | The domain and the glossary describe comparing scenarios and the weekly load, with worked examples that the next slices turn into unit tests. Docs only                                                                                                                                      |
| 1   | Duplicate a scenario   | A member duplicates a scenario of a project into a new draft with the same team and extra costs, to make a variant without rebuilding it                                                                                                                                                     |
| 2   | Compare side by side   | Two or three scenarios of a project side by side, the chosen one next to drafts: result lines and their differences from the baseline with rate access, team and hours for everyone, an undetermined figure never shown as a difference. It works with the keyboard and on mobile, read-only |
| 3   | Weekly load and rule c | The bench shows each person's load week by week over the scenario's weeks, and the team flags over-allocated people with the weeks and the projects behind them (rule c), the first health check. Measured with realistic data                                                               |
| 4   | v0.4 release           | Handoff, README with new screenshots, tag `v0.4.0`                                                                                                                                                                                                                                           |

### v0.3 slices

v0.3 ships in five pull requests or more, tests first, in this order. Access and deletion are
designed from the second slice on, not added at the end.

| #   | Slice                   | Done when                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Partial results         | The engine returns every line it can compute and marks the others undetermined, with why ([partial results](domain.md#partial-results)), and the summary shows them that way. A complete result is unchanged: the guide case and the invariants still pass as they are. Pure, so it also improves the demo                                                                               |
| 2   | Identity and membership | Sign-in with GitHub and Google behind the sign-up switch, an empty organization or the adopted visitor's copy, membership resolved on the server before `withOrganization`, and the owner deleting the organization or their account. DB tests prove a member cannot reach another organization and that rate access follows the member ([ADR 0012](adr/0012-sign-in-and-membership.md)) |
| 3   | Own data                | Inside a project's flow, with rate access, create and edit categories with their costs, people and open roles, and a project with its name, client and pricing model; the categories' costs are entered without leaving the project. Small categories warn (rule j)                                                                                                                      |
| 4   | Project and period      | The project's planned period and description: new assignments start from the planned period, undated recurring costs follow it, and assignments outside it are flagged, never refused ([planned period](domain.md#planned-period)). Slice 3's project form grows into this one, never a second form                                                                                      |
| 5   | v0.3 release            | The owner's processing review is done; the switch stays off until the owner turns it on. Handoff, README with new screenshots, tag `v0.3.0`                                                                                                                                                                                                                                              |

### v0.2 slices

v0.2 ships in eight pull requests, tests first, in this order. Saving and the visitor's copy are
settled in [ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md); the rules for changes,
how busy a person is and choosing are in [the domain](domain.md#editing-a-scenario).

| #   | Slice                         | Done when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Change model                  | A pure module in `src/lib/scenarios` applies a change to a team or rejects it with a reason, keeps the history and its cursor, and returns what is left to save. Zod schemas and fast-check properties, no UI                                                                                                                                                                                                                                                                                                             |
| 2   | Saving and the visitor's copy | A Server Action saves a list of changes against a base version and returns the new version or a conflict. The first edit makes the visitor's copy and sets the cookie. DB tests cover RLS, conflicts, the copy and its limit                                                                                                                                                                                                                                                                                              |
| 3   | Store and header              | A Zustand store drives the canvas, the table and the summary. ⌘Z and ⇧⌘Z undo and redo, the header shows the save state, totals count up with Motion and a live region announces each change                                                                                                                                                                                                                                                                                                                              |
| 4   | Bench                         | The left panel lists active people by category with how busy each is, and filters them. It works with the keyboard and in both themes                                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | Keyboard parity               | "Add to team…", "Move to…" and "Remove" on nodes and table rows, with the focus manager, which keeps focus across the move to the copy. Every change can be made without a pointer, and an E2E test proves it with axe. A second PR tests the real path end to end: save, copy and redirect, history and undo, a failed save, back and forward                                                                                                                                                                            |
| 5b  | Edit                          | From the same menus, a dialog edits an assignment's project role, allocation, weekly hours and dates, fills an open role with a person or opens it again (docs/domain.md, "Changes")                                                                                                                                                                                                                                                                                                                                      |
| 6   | Drag                          | One pointer-events layer drags from the bench to the canvas and inside the tree, with the drop-target hit test shared with the keyboard menus (ADR 0008); a drop is valid only where `moveTargets` offers it, as in "Move to…". Mouse in E2E, touch in Chromium emulation                                                                                                                                                                                                                                                 |
| 7   | Choose scenario               | With rate access, choosing a scenario after a dialog writes its frozen tables in one transaction, shows it as chosen and locks its team; unchoosing unlocks it. A visitor's first choice makes their copy, as a first save does. Without rate access the action is not offered and the server refuses it. The demo seed's chosen scenarios, and visitor copies made from them, get their frozen rows backfilled; the seed's ongoing chosen scenarios are anchored to the day it runs (docs/domain.md, "The demo's dates") |
| 8   | v0.2 release                  | Handoff, README with new screenshots, tag `v0.2.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Clean-up of idle copies (ADR 0011) ships with slice 2 or right after it, before the release.

### v0.2 build notes

The simulator spike ([findings](research/simulator-poc/README.md)) settled how the canvas is built:
[ADR 0008](adr/0008-simulator-interaction-stack.md). The accessible tree or table view and a focus
manager ship in v0.2, not as later polish. The spike also left patterns and traps worth keeping:

- **React Compiler:** no ref writes during render (current node positions live in a ref an effect
  updates); read the system color scheme with `useSyncExternalStore`, not `setState` in an effect.
- **Zustand 5:** selectors must return stable references, so the team derived from the changes is
  cached outside React, not rebuilt in the selector.
- **React Flow:** `nodeTypes` is a module-level constant.
- **shadcn `init`** (style `base-nova`) can write a circular `--font-sans`: check the font is Geist.
- **Contrast:** the default `muted-foreground` on `muted` is 4.34:1 in the light theme and fails AA.

## Non-goals for v1

- Real-time collaboration (scenarios use optimistic locking instead).
- HRIS integrations (CSV import instead).
- A mobile editor (mobile is read-only).
- Several currencies or countries, contractors.
- Per-person cost adjustments, productivity by seniority, schedule effects (Brooks's law).
- A monorepo.
- Merging teams with animation, an early idea from when Squadio simulated reorganizations: nothing
  so far says consultancies need it more than duplicating and comparing.
- Formal approval with its own states, until interviews show it is needed (v0.5 shares and lets
  someone choose, without an approval workflow).

## Principles

- **Structure, not people:** Squadio analyses teams and costs. Neither the rules nor the AI judge
  individuals or suggest who to remove from a team.
- **Measured, not claimed:** performance, accessibility and security claims in the README link to
  how they were measured.
- **Free tier first:** GitHub, Vercel Hobby, Neon, Cloudflare, Resend and Sentry free plans.
  Anything paid needs a reason in an ADR.
