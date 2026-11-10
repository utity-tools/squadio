import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The pieces every section of the landing repeats (design "Landing": .eyebrow, .h2, .num).

/** The small capital line above a section's title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] font-semibold tracking-[0.08em] text-brand-text uppercase">
      {children}
    </p>
  );
}

/** A section's title, named by its `id` for the section's `aria-labelledby`. */
export function SectionTitle({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "text-[clamp(28px,3.4vw,40px)] leading-[1.1] font-bold text-balance",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** A step's or a pain's number, in the figures' face: 01, 02… */
export function StepNumber({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("font-mono text-[13px] font-medium text-brand-text", className)}>
      {children}
    </span>
  );
}

/** A person on the bench, as the editor draws them; the bar is how busy they look. */
export function BenchCard({
  name,
  fill,
  className,
}: {
  name: string;
  fill: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border bg-card px-2.25 py-1.75 text-xs",
        className,
      )}
    >
      <span className="truncate">{name}</span>
      <span className="h-1 w-9 shrink-0 overflow-hidden rounded-xs bg-muted">
        <span className="block h-full bg-muted-foreground" style={{ width: `${fill}%` }} />
      </span>
    </div>
  );
}
