"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's `lg`: from here up the bench docks under the team. */
const LARGE_SCREEN = "(min-width: 64rem)";

// The place at the end of the bench's row where the team's views draw "Add to team…" from lg. The
// bench lives outside the team's editing context, so the views portal the button there, which
// keeps their context. The bench registers the place with a ref callback, so the views find it
// whenever either is drawn, in any order.
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * The bench's ref callback for its slot. Letting go clears only the place it registered: a bench
 * drawn anew may register its own before the old one lets go.
 */
export function benchSlot(element: HTMLElement | null) {
  // With a cleanup returned, React calls this with an element only; null is for its types.
  if (element === null) return;
  slot = element;
  notify();
  return () => {
    if (slot !== element) return;
    slot = null;
    notify();
  };
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const large = window.matchMedia(LARGE_SCREEN);
  large.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    large.removeEventListener("change", onChange);
  };
}

/** The bench's place for "Add to team…", from lg only; null below it and on the server. */
export function useBenchSlot(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(LARGE_SCREEN).matches ? slot : null),
    () => null,
  );
}
