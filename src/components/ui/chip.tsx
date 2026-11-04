import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

// ADR 0014: radius 6, never pills. A status chip says its word and carries a dot as well, so
// colour is never the only signal. "Chosen" is the brand's; the margin's status never is.
const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border border-transparent px-2 py-0.5 text-xs/normal font-semibold whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      tone: {
        ok: "tint-ok text-status-ok-text",
        warn: "tint-warn text-status-warn-text",
        bad: "tint-bad text-status-bad-text",
        pending: "border-dashed border-status-warn tint-warn text-status-warn-text",
        na: "bg-muted text-muted-foreground",
        error: "border-status-bad tint-bad text-status-bad-text",
        chosen: "bg-brand-solid text-brand-solid-foreground",
        demo: "tint-brand text-brand-text",
        muted: "bg-muted text-muted-foreground",
        open: "border-[1.5px] border-dashed border-muted-foreground text-muted-foreground",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

const dots = { ok: "bg-status-ok", warn: "bg-status-warn", bad: "bg-status-bad" } as const;

type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>;

function Chip({
  className,
  tone = "muted",
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: ChipTone }) {
  const dot = tone in dots ? dots[tone as keyof typeof dots] : null;

  return (
    <span
      data-slot="chip"
      data-tone={tone}
      className={cn(chipVariants({ tone }), className)}
      {...props}
    >
      {dot && (
        <span
          data-slot="chip-dot"
          aria-hidden="true"
          className={cn("size-[7px] shrink-0 rounded-[2px]", dot)}
        />
      )}
      {children}
    </span>
  );
}

export { Chip, chipVariants, type ChipTone };
