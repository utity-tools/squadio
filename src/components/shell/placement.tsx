"use client";

import { type ReactNode, createContext, use } from "react";

/**
 * Where a piece of the shell is drawn: in the top bar and the sidebar from lg, or in the ☰ menu
 * below it (design boards 28–30), whose items are 44 px rows. The pages pass the same sections and
 * account to both, and each piece draws itself for its place.
 */
export type Placement = "bar" | "menu";

const PlacementContext = createContext<Placement>("bar");

export function ShellPlacement({ value, children }: { value: Placement; children: ReactNode }) {
  return <PlacementContext value={value}>{children}</PlacementContext>;
}

export const useShellPlacement = () => use(PlacementContext);

/** A 44 px row of the ☰ menu (`.mitem` in the design's CSS), for links and buttons alike. */
export const menuItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-[15px] text-foreground transition-colors duration-(--duration-fast) hover:bg-accent [&[aria-current]]:bg-selected [&[aria-current]]:font-medium [&[aria-current]]:text-selected-foreground motion-reduce:transition-none [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&[aria-current]_svg]:text-selected-foreground";
