import { useSyncExternalStore } from "react";
import { vi } from "vitest";

// What Next.js gives client components about the URL, for jsdom: the app router keeps
// `useSearchParams` in sync with `window.history.replaceState`, and this does the same.
// Use it with `vi.mock("next/navigation", () => import("@/test/navigation"))`.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function useSearchParams() {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => window.location.search,
  );
  return new URLSearchParams(search);
}

/**
 * Puts the page at `url` and spies on `history.replaceState`, telling `useSearchParams` about
 * every call as the app router does. The router does it inside a transition, so it can land after
 * the next key: with `deferred`, nothing is told until `flush` is called. Returns the spy.
 */
export function stubHistory(url: string, { deferred = false } = {}) {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", url);
  const replaceState = window.history.replaceState.bind(window.history);
  let pending = false;
  const spy = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation((...args: Parameters<History["replaceState"]>) => {
      replaceState(...args);
      if (deferred) pending = true;
      else notify();
    });
  return Object.assign(spy, {
    /** Tells `useSearchParams` about the deferred URL changes. */
    flush() {
      if (!pending) return;
      pending = false;
      notify();
    },
  });
}

const screenState = { wide: true };
const mediaChanges = new Set<() => void>();
/** One list per query, as a component may keep the list it got. */
const mediaLists = new Map<string, MediaQueryList>();

function matchMedia(query: string) {
  let list = mediaLists.get(query);
  if (!list) {
    list = {
      media: query,
      get matches() {
        return query.includes("min-width") ? screenState.wide : true;
      },
      addEventListener: (_type: string, listener: () => void) => mediaChanges.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaChanges.delete(listener),
    } as unknown as MediaQueryList;
    mediaLists.set(query, list);
  }
  return list;
}

/**
 * Stubs `matchMedia`: the `(min-width: …)` query matches while the screen is wide, and reduced
 * motion always does, so zooming is instant. `resize` changes the width and tells the listeners.
 */
export function stubScreen({ wide }: { wide: boolean }) {
  screenState.wide = wide;
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    resize(next: boolean) {
      screenState.wide = next;
      for (const listener of mediaChanges) listener();
    },
  };
}
