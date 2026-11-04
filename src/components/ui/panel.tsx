import type * as React from "react";

import { cn } from "@/lib/utils";

const CARD = "flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-xs";

/** A section of a page: bordered, radius 14, the faintest shadow (ADR 0014). */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section data-slot="panel" className={cn(CARD, "gap-3 px-5 py-4.5", className)} {...props} />
  );
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="panel-title" className={cn("text-[15px]", className)} {...props} />;
}

type KpiProps = Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  /** The figure cannot be worked out yet: the value says why, in words, on the warning's tint. */
  pending?: boolean;
  children?: React.ReactNode;
};

/** One headline figure: its name above, the value in mono. */
function Kpi({ label, value, pending = false, className, children, ...props }: KpiProps) {
  return (
    <div
      data-slot="kpi"
      data-pending={pending || undefined}
      className={cn(
        CARD,
        "gap-1.5 px-4.5 py-4",
        pending && "border-dashed border-status-warn tint-warn shadow-none",
        className,
      )}
      {...props}
    >
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "leading-[1.15] font-semibold tracking-[-0.02em]",
          pending
            ? "font-sans text-[22px] text-status-warn-text"
            : "font-mono text-[28px] tabular-nums",
        )}
      >
        {value}
      </p>
      {children}
    </div>
  );
}

export { Kpi, Panel, PanelTitle };
