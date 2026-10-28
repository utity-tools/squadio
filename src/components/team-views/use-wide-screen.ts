"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's `md`: from here up the tree is the default view, below it the table. */
const WIDE_SCREEN = "(min-width: 48rem)";

let wideScreen: MediaQueryList | undefined;

/** The media query list, made once and only in the browser. */
function wideScreenQuery() {
  wideScreen ??= window.matchMedia(WIDE_SCREEN);
  return wideScreen;
}

function subscribeToWidth(onChange: () => void) {
  const media = wideScreenQuery();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Whether the screen is `md` or wider; null on the server and while hydrating. */
export function useWideScreen(): boolean | null {
  return useSyncExternalStore(
    subscribeToWidth,
    () => wideScreenQuery().matches,
    () => null,
  );
}
