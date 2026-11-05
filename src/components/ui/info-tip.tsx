"use client";

import { InfoIcon } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type InfoTipProps = {
  /** The button's name: "What is: Overhead". */
  label: string;
  /** The term, heading the tip. */
  title: string;
  /** How it is worked out, in the figures' face under a rule. */
  formula?: string;
  /** What the term means. */
  children: ReactNode;
  className?: string;
};

/**
 * The "i" before a figure's label (ADR 0014, board "Info"): it says what the term means and how it
 * is worked out. A tooltip: it opens while the pointer is over it or the keyboard's focus is on it,
 * and closes as soon as either leaves, or with Escape, so it never stays open. It is a little
 * smaller than the label and sits at its top-left, with a 24 px hit area.
 */
export function InfoTip({ label, title, formula, children, className }: InfoTipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={150} disableHoverableContent>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "relative me-1 inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-full align-top text-muted-foreground after:absolute after:-inset-[5px] hover:text-foreground data-[state=delayed-open]:text-foreground data-[state=instant-open]:text-foreground",
              className,
            )}
          >
            <InfoIcon aria-hidden className="size-3" />
          </button>
        </TooltipPrimitive.Trigger>
        {/* In place, not in a portal: it stays inside the rail's landmark. It floats all the same. */}
        <TooltipPrimitive.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-70 max-w-[calc(100vw-16px)] rounded-[10px] border bg-popover px-3.5 py-3 text-start text-[13px]/[1.45] font-normal tracking-normal whitespace-normal text-popover-foreground normal-case shadow-lg"
        >
          <span className="mb-1 block font-semibold">{title}</span>
          <span className="block">{children}</span>
          {formula && (
            <span className="mt-2 block border-t pt-2 font-mono text-xs text-muted-foreground">
              {formula}
            </span>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
