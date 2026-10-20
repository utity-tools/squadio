# Simulator PoC: findings

Throwaway proof of concept for Squadio's main screen: a bench, a team tree, and live cost.
All data is synthetic (invented names, categories and costs). Built on 2026-10-15.

**Verdict:** the stack holds. Keep React Flow, Zustand and Motion. Change two things: replace
HTML5 drag-and-drop with a small pointer-events drag layer, and replace the layout libraries with a
custom compact tree layout.

> Archived copy. The PoC itself was a throwaway repository and is not published: file names such
> as `bench.tsx` or `e2e/measure.spec.ts` refer to it. The raw numbers and two screenshots are
> kept here; the screen recording is not. The decisions are in
> [ADR 0008](../../adr/0008-simulator-interaction-stack.md).

## What was built

- **Bench:** 150 people across 7 categories, plus one "open role" card per category, with search.
  It uses three input paths: HTML5 drag (mouse), pointer drag from the grip (touch and pen), and a
  "+" menu (keyboard).
- **Tree:** React Flow with the project manager on top.
  - Drop onto any node to add under it. Drop on empty canvas to add under the PM.
  - Drag a node onto another node to move it there.
  - Each node has a "…" menu with "Move to…" and "Remove".
- **Scenario store:** Zustand. A scenario is `changes[]` plus a cursor:
  - Undo and redo move the cursor (⌘Z / ⇧⌘Z).
  - The team is derived from the changes by a pure function and cached per `(changes, cursor)`.
  - Fake cost, margin and margin % recalculate on every change, and are announced through an
    `aria-live` region.
- **Layout and animation:** four interchangeable layout engines (compact, d3-hierarchy, dagre,
  elkjs) and three animation modes (Motion tween, CSS transition, none), switchable in the toolbar.
- **Accessibility:**
  - `prefers-reduced-motion` turns off the tweens.
  - Light and dark themes follow the system, with a toggle.
  - axe shows 0 violations in both themes.

How it was measured: Playwright suites (`e2e/measure.spec.ts`) against the production build, on
headless Chromium on an Apple Silicon Mac. They ran at normal speed and at 4× CPU throttling. Raw
numbers are in [`measure.jsonl`](measure.jsonl). The recording (not archived here) was
`recording/simulator-poc-tour.webm`: 41 s, scripted with
Playwright (`e2e/tour.spec.ts`), not filmed by hand.

## 1. Bench-to-canvas drag: does React Flow's HTML5 pattern hold up?

| Input                         | Result                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mouse**                     | Works. Drop onto a specific node and onto empty canvas both pass, and so does moving nodes inside the tree.                                                                                |
| **Touch**                     | **Fails.** A long press plus a move on the card body produced no drop in Chromium touch emulation. A long press can also leave Chromium mid-gesture, so the next touch fails until reload. |
| **Touch with pointer events** | Works. Dragging from a grip handle with `touch-action: none`, a portal ghost and `elementFromPoint` hit testing added the person.                                                          |
| **Keyboard**                  | HTML5 drag has no keyboard story. The "Add to team…" and "Move to…" menus (shadcn on Base UI) give full parity: from the search box it is 2 Tabs to the first "+", then Enter, ↓, Enter.   |

**Smallest fix:** the pointer-events drag layer (about 40 lines in `bench.tsx`). It shares one hit
test (`use-tree-drop.ts`) with the HTML5 and keyboard paths.

**Recommendation:** in v0.2, use pointer events for every pointer type and drop HTML5 drag
entirely:

- One code path instead of two.
- No `DataTransfer` quirks and no browser drag image.
- It works with touch.
- dnd-kit is not needed.

Mobile stays read-only (plan.md non-goal), so touch is a nice-to-have, but the fix is cheap anyway.

**Keyboard caveats:**

- **Lost focus.** When a person is added from the bench, their "+" trigger becomes disabled, so
  closing the menu dropped focus on `<body>`. The PoC moves focus to the new node with a small
  hack that only rescues lost focus. The real build needs a deliberate focus manager: after add,
  move or remove, focus the affected node or its parent.
- **Delete key.** React Flow's own Delete key did not remove a focused node in our test. The cause
  was not investigated, and the explicit "Remove" action covers it.
- **Not a screen-reader tree.** The canvas is not a screen-reader tree. The "accessible view" in
  plan.md (a tree or table with the same actions) is still needed.

**Not verified:** real iOS Safari and Android Chrome devices. Touch was tested only through CDP
emulation.

## 2. Layout library, and how well Motion animates React Flow nodes

Layout time for 30 nodes:

| Engine           | Normal speed | 4× throttled | Bundle cost                               | Result for a wide team                       |
| ---------------- | ------------ | ------------ | ----------------------------------------- | -------------------------------------------- |
| compact (custom) | 0.3 ms       | 0.6 ms       | 0 (about 60 lines)                        | **Fits: 30 nodes at 66% zoom**               |
| d3-hierarchy     | 0.8 ms       | 2.5 ms       | small                                     | about 5,000 px wide, hits React Flow minZoom |
| dagre            | 10 ms        | 29 ms        | medium                                    | same width problem                           |
| elkjs (mrtree)   | 33 ms        | 115 ms       | **1.9 MB chunk (600 KB gzip)**, async API | same width problem                           |

**Main finding: the library is not the problem; the tree shape is.**

- A PM with 20–25 direct reports is normal in consultancies.
- A classic top-down tidy tree lays them out side by side. Every library above does this, and 30
  nodes become unreadable.
- The custom compact layout (`src/lib/layout.ts`) works like an org chart: when a node has more than
  two leaf children, those leaves stack in one column with edges entering from the left. It is a
  pure function, trivially unit-testable, and fast.
- Screenshots: [`compact-30-light.png`](compact-30-light.png) versus
  [`d3-30-light.png`](d3-30-light.png).

**Layout recommendation:** use the custom compact layout in `src/lib/layout`, covered by fast-check
properties (no overlaps, every parent above its children). Do not adopt dagre or elkjs. Only reach
for d3-hierarchy if we want its traversal helpers.

**Motion:**

- **Approach.** React Flow owns each node's `transform`, so Motion components cannot animate node
  DOM directly. What works is using Motion's `animate(0, 1, { onUpdate })` as a tween driver that
  interpolates node positions into React Flow state on every frame.
- **Performance.** It holds 55–60 fps at 30 nodes, even at 4× CPU throttling.
- **Correctness.** Nodes being dragged are skipped, and new nodes start where they were dropped or
  from their parent.
- **Reduced motion.** `useReducedMotion()` switches to an instant re-layout. The test sampled six
  frames and saw one position.

**CSS transition alternative:** `transition: transform` on `.react-flow__node:not(.dragging)`.

- Cheaper, with no React updates per frame.
- But you cannot choose where new nodes enter from.
- Edges animate through the CSS `d` property, which was only checked in Chromium.

**Animation recommendation:** use the Motion tween for re-layout. Use Motion components for the
rest of the UI (bench, totals). Keep the CSS mode out.

## 3. Is it smooth with 150 bench items and 20–30 tree nodes?

Yes, with margin. Production build:

| Scenario                                        | Normal speed             | 4× CPU throttling        |
| ----------------------------------------------- | ------------------------ | ------------------------ |
| Animated re-layout while filling the tree to 30 | min 60 fps, 0 long tasks | min 56 fps, 0 long tasks |
| Dragging a node for about 2 s with 30 nodes     | 60 fps                   | 60 fps                   |
| 20 undos + 20 redos as fast as possible         | 60 fps                   | min 47 fps               |
| Search filtering over 150 bench cards           | 18–29 ms                 | about 60 ms              |
| DOMContentLoaded / load                         | 46 / 69 ms               | 50 / 234 ms              |

**Caveats:**

- FPS is sampled per one-second window and capped at 60 by headless Chromium.
- No low-end device was tested.
- The bench is not virtualized. At 150 items it does not need to be. Revisit around 1,000 items.

## 4. React 19 and React Compiler issues

No issues found with React Flow 12.12, Motion 14.2, Zustand 5 or Base UI 1.9:

- **Compiler is active.** Memo-cache sentinels are present in the client bundles.
- **Compiler rules are clean.** `eslint-config-next` (React Compiler rules) passes with zero
  warnings.
- **No console errors.** There are none in dev or production builds.

Patterns the compiler and lint rules pushed us towards. They are worth writing down for v0.2:

- **No ref writes during render.** The current node positions live in a ref that an effect
  updates.
- **System color scheme.** It is read with `useSyncExternalStore`, not with `setState` inside an
  effect.
- **Stable Zustand selectors.** Zustand 5 selectors must return stable references. The derived
  team is cached outside React (`selectTeam`), not rebuilt inside the selector.
- **Constant `nodeTypes`.** React Flow's `nodeTypes` must be a module-level constant.

Tooling quirks, not React issues:

- **`shadcn init` (style `base-nova`) wrote a circular `--font-sans`.** The whole app rendered in
  Times until we pointed it at Geist.
- **Contrast.** The default `muted-foreground` on `muted` is 4.34:1 in the light theme and fails
  AA. axe caught it.
- **React Flow attribution.** Hiding it requires a React Flow Pro subscription, so the PoC keeps it.

## 5. What we would change in the stack, and why

1. **HTML5 drag-and-drop → a pointer-events drag layer.** One path for mouse, touch and pen. Still
   no dnd-kit: the layer is tiny and React Flow already handles drags inside the canvas.
2. **dagre / elkjs → a custom compact layout in `src/lib/layout`.** It fits real team shapes, costs
   no bundle weight and is easy to property-test. elkjs alone would add 600 KB gzip.
3. **Motion: keep it, with a narrower job.** It drives re-layout tweens and UI micro-animations. It
   does not animate React Flow nodes directly.
4. **Add a focus manager and the accessible tree or table view early**, not as a later polish step.
   Keyboard parity came down to focus handling, not to the menus.
5. **Validate changes at dispatch time.** In the PoC an invalid change (a cycle or a duplicate
   person) becomes a silent no-op that still takes an undo slot. In the real store, reject it before
   it reaches `changes[]`, with Zod at the boundary as AGENTS.md already says.
6. **Keep everything else as decided:** Next.js 16, React 19 with the Compiler, Tailwind v4,
   shadcn/ui and Zustand. The scenario-as-changes model with an undo cursor was simple and fast.

## Running it

In the PoC repository, not in this one:

```bash
pnpm install
pnpm dev                      # http://localhost:3000
pnpm build && pnpm start -p 3101
BASE_URL=http://localhost:3101 npx playwright test --project=measure   # numbers → perf-results/
BASE_URL=http://localhost:3101 npx playwright test --project=tour      # video → e2e-results/
CPU_THROTTLE=4 BASE_URL=http://localhost:3101 npx playwright test --project=measure -g performance
```
