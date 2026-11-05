"use client";

import { InfoIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { type ReactNode, useId } from "react";

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
 * The "i" next to a figure (ADR 0014, board "Info"): it says what the term means and how it is
 * worked out. A toggle, not a hover tooltip, so a tap and the keyboard open it as well as a click;
 * Escape or a click outside closes it and gives the focus back. The button is 18 px with a 32 px
 * hit area, so it sits in a line of text without crowding it.
 */
export function InfoTip({ label, title, formula, children, className }: InfoTipProps) {
  const titleId = useId();

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "relative ms-1 inline-flex size-[18px] shrink-0 cursor-help items-center justify-center rounded-full align-[-3px] text-muted-foreground after:absolute after:-inset-[7px] hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
            className,
          )}
        >
          <InfoIcon aria-hidden className="size-3.5" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          aria-labelledby={titleId}
          side="top"
          sideOffset={8}
          collisionPadding={8}
          className="z-50 w-70 max-w-[calc(100vw-16px)] rounded-[10px] border bg-popover px-3.5 py-3 text-start text-[13px]/[1.45] font-normal text-popover-foreground shadow-lg"
        >
          <p id={titleId} className="mb-1 font-semibold">
            {title}
          </p>
          <p>{children}</p>
          {formula && (
            <p className="mt-2 border-t pt-2 font-mono text-xs text-muted-foreground">{formula}</p>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
