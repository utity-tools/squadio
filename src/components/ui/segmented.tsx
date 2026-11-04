"use client";

import { RadioGroup } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A few options, one of them chosen: a radio group, one tab stop, the arrows move and choose
 * (APG). The active option is neutral, in --primary, never the brand (ADR 0014).
 */
function Segmented({ className, ...props }: React.ComponentProps<typeof RadioGroup.Root>) {
  return (
    <RadioGroup.Root
      data-slot="segmented"
      orientation="horizontal"
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-md border border-input bg-background p-0.5",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedItem({ className, ...props }: React.ComponentProps<typeof RadioGroup.Item>) {
  return (
    <RadioGroup.Item
      data-slot="segmented-item"
      className={cn(
        "inline-flex h-7.5 min-w-8 items-center justify-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--duration-fast) ease-snappy hover:text-foreground focus-visible:z-10 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
