# Plan

Squadio is a staffing simulator for consultancies. When a new project comes in, you build candidate
teams by dragging people or open roles into a scenario and see cost, margin and effective hourly
rate update live, before you commit. Simulating your own company is just another project.

## Who it is for

The consultancy or company that has to decide which team takes a project, and at what price.
Managers and directors see rates, costs and margins; everyone else sees projects and teams only.

## Main screen

- **Bench** (left): the organization's people grouped by category, with how busy each one is.
- **Scenario team** (right): a tree (project manager on top, team below). Drop people or open roles
  on it; cost, margin and the margin status recalculate on every move.
- **Comparison:** two or three scenarios of the same project side by side.
- **Accessible view:** the same data and the same actions as a tree or table that works with the
  keyboard and screen readers.

## Roadmap

Every version ships something that can be shown. v0.1 shipped on 2026-10-26
([handoff 0011](sessions/0011-read-only-canvas.md)).

| Version | Scope                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------- |
| v0.1    | Costing engine, with the guide case as the first test. Read-only canvas with seed data          |
| v0.2    | Scenarios: drag people and open roles, live cost and margin, undo and redo                      |
| v0.3    | Scenario comparison, duplicate scenarios, merge teams with animation                            |
| v0.4    | Deterministic health checks: over-allocation, seniority mix, PM ratio, single points of failure |
| v0.5    | Auth, multi-tenancy, organization templates, public demo, CSV import                            |
| v1.0    | AI assistant on top of the health checks ([ADR 0003](adr/0003-structure-not-people.md))         |

### v0.2 slices

v0.2 ships in eight pull requests, tests first, in this order. Saving and the visitor's copy are
settled in [ADR 0011](adr/0011-saving-edits-and-the-visitor-copy.md); the rules for changes,
how busy a person is and choosing are in [the domain](domain.md#editing-a-scenario).

| #   | Slice                         | Done when                                                                                                                                                                                                                    |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Change model                  | A pure module in `src/lib/scenarios` applies a change to a team or rejects it with a reason, keeps the history and its cursor, and returns what is left to save. Zod schemas and fast-check properties, no UI                |
| 2   | Saving and the visitor's copy | A Server Action saves a list of changes against a base version and returns the new version or a conflict. The first edit makes the visitor's copy and sets the cookie. DB tests cover RLS, conflicts, the copy and its limit |
| 3   | Store and header              | A Zustand store drives the canvas, the table and the summary. ⌘Z and ⇧⌘Z undo and redo, the header shows the save state, totals count up with Motion and a live region announces each change                                 |
| 4   | Bench                         | The left panel lists active people by category with how busy each is, and filters them. It works with the keyboard and in both themes                                                                                        |
| 5   | Keyboard parity               | "Add to team…", "Move to…" and "Remove" on nodes and table rows, with the focus manager. Every change can be made without a pointer, and an E2E test proves it with axe                                                      |
| 6   | Drag                          | One pointer-events layer drags from the bench to the canvas and inside the tree, with the drop-target hit test shared with the keyboard menus (ADR 0008). Mouse in E2E, touch in Chromium emulation                          |
| 7   | Choose scenario               | With rate access, choosing a scenario writes its frozen tables in one transaction and shows it as chosen. Without rate access the action is not offered and the server refuses it                                            |
| 8   | v0.2 release                  | Handoff, README with new screenshots, tag `v0.2.0`                                                                                                                                                                           |

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

## Principles

- **Structure, not people:** Squadio analyses teams and costs. Neither the rules nor the AI judge
  individuals or suggest who to remove from a team.
- **Measured, not claimed:** performance, accessibility and security claims in the README link to
  how they were measured.
- **Free tier first:** GitHub, Vercel Hobby, Neon, Cloudflare, Resend and Sentry free plans.
  Anything paid needs a reason in an ADR.
