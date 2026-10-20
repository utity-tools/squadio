# 0008. Simulator interaction stack

- **Status:** accepted
- **Date:** 2026-10-20

## Context

v0.2 makes the main screen interactive: drag people and open roles from the bench into a team tree,
move them inside it, undo and redo, with cost and margin updating live ([plan](../plan.md)).
[ADR 0001](0001-stack-and-workflow.md) chose React Flow, Motion and Zustand for this, and left the
tree layout library to a spike.

The spike was a throwaway proof of concept with synthetic data: a bench of 150 people and a tree of
up to 30 nodes, measured with Playwright against a production build at normal speed and at 4× CPU
throttling. Its [findings and raw numbers](../research/simulator-poc/README.md) show that the stack
holds, with three problems:

- **HTML5 drag-and-drop**, React Flow's pattern for dropping from outside the canvas, failed with
  touch in Chromium touch emulation and has no keyboard path. A small pointer-events layer worked
  with touch there; it is meant to serve every pointer type.
- **Tree shape, not the library.** A project manager with 20–25 direct reports is normal in
  consultancies. Every tidy-tree library (d3-hierarchy, dagre, elkjs) lays them out side by side,
  and 30 nodes become unreadable: d3-hierarchy reached about 5,000 px, and dagre and elkjs were
  just as wide. A custom org-chart layout that stacks leaf children in a column fits the same team
  at 66% zoom.
- **Motion cannot animate React Flow nodes directly**, because React Flow owns each node's
  `transform`.

## Decision

Keep React Flow, Motion and Zustand, and change how each is used:

1. **Drag:** one pointer-events drag layer for mouse, touch and pen, from the bench into the canvas.
   No HTML5 drag-and-drop and no dnd-kit. React Flow keeps handling drags inside the canvas. The
   bench, the canvas and the keyboard menus share one drop target hit test.
2. **Layout:** a custom compact layout in `src/lib/layout`. It is a pure function: when a node has
   more than two leaf children, those leaves stack in one column. Its fast-check properties include
   no overlapping nodes and every parent above its children. No dagre or elkjs.
3. **Animation:** Motion's `animate(0, 1, { onUpdate })` drives re-layout tweens by interpolating
   node positions into React Flow state. Nodes being dragged are skipped, and new nodes enter from
   where they were dropped or from their parent. With reduced motion, re-layout is instant. Motion
   components animate the rest of the UI (bench, totals).
4. **Keyboard and screen readers from the start:** "Add to team…" and "Move to…" menus give the
   keyboard the same actions as drag. A focus manager moves focus to the affected node, or its
   parent, after every add, move or remove. The accessible tree or table view ships in v0.2, not
   later.
5. **Changes are validated when dispatched:** the scenario store rejects an invalid change (a cycle,
   a duplicate person) with Zod before it reaches the list of changes, so it never takes an undo
   slot.

## Alternatives considered

- **HTML5 drag-and-drop with a touch fallback:** two code paths, `DataTransfer` quirks, and the
  fallback is the pointer layer anyway.
- **dnd-kit:** overlaps with React Flow's own dragging, as ADR 0001 already noted, and the pointer
  layer is about 40 lines.
- **elkjs:** 33 ms per layout at 30 nodes (115 ms throttled), a 600 KB gzip chunk and an async API,
  and it still produces the wide tree.
- **dagre:** 10 ms per layout and the same wide tree.
- **d3-hierarchy:** fast and small, but the same wide tree. Only worth adding later for its traversal
  helpers.
- **CSS `transition: transform` on nodes:** cheaper, but new nodes cannot choose where they enter
  from, and animating edges through the CSS `d` property was only checked in Chromium.

## Consequences

- The layout is our code: no bundle weight and easy to property-test, but every new tree shape is
  ours to handle.
- The PoC measured at least 56 fps for animated re-layout with 30 nodes, even throttled, and 47 fps
  at worst during fast undo and redo. Filtering 157 bench cards (150 people and 7 open roles) took
  18 ms, about 60 ms throttled. The bench is not virtualized; revisit around 1,000 people.
- Touch was only tested through Chromium emulation, and no low-end device was tested. Mobile stays
  read-only ([plan](../plan.md)), so touch editing is not a goal, but it should not break.
- React Flow's Delete key did not remove a focused node in the PoC. The explicit "Remove" action
  covers it; find the cause before relying on the key.
- Hiding the React Flow attribution needs a paid plan, so it stays.
