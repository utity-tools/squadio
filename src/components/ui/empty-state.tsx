import { SearchIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** An `EmptyArt`: decoration, so the title and description carry the whole message. */
  art: React.ReactNode;
  title: React.ReactNode;
  /** One sentence on what to do next. */
  description?: React.ReactNode;
  /** The one main action, and a secondary one as a link or ghost button, if they exist. */
  actions?: React.ReactNode;
  /** The heading's level in its page: 2 for a page's section, 3 inside a titled panel. */
  level?: 2 | 3;
  /** For the region around it to name itself after the title. */
  titleId?: string;
  /** For a narrow place, such as the bench: a smaller title. */
  compact?: boolean;
  className?: string;
};

/**
 * What a place shows while it has nothing to show yet (board «Estados vacíos»): the logo's
 * squares, a title that says what is going on and a sentence on what to do next. No exclamations,
 * and no action the app cannot take yet.
 */
export function EmptyState({
  art,
  title,
  description,
  actions,
  level = 2,
  titleId,
  compact = false,
  className,
}: EmptyStateProps) {
  const Heading = level === 2 ? "h2" : "h3";

  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-3 text-center", className)}
    >
      {art}
      <Heading
        id={titleId}
        className={cn(
          "font-semibold tracking-tight text-balance",
          compact ? "text-base" : "text-lg",
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className="max-w-xl text-sm text-balance text-muted-foreground">{description}</p>
      )}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

type EmptyArtProps = {
  /**
   * - `add`: the first square to add, the other two still dashed (an empty team).
   * - `search`: two squares found, the third dashed, under a magnifying glass (nobody matches).
   * - `outline`: all three dashed in the brand's colour (nothing created yet).
   * - `missing`: the logo with its top square gone (the page not found).
   */
  variant: "add" | "search" | "outline" | "missing";
  className?: string;
};

const SQUARE = { width: 80, height: 80, rx: 24 } as const;
const DASHED = { fill: "none", strokeWidth: 3, strokeDasharray: "9 7" } as const;

/** The logo's three squares, drawn for an empty state (ADR 0014: structure, never people). */
export function EmptyArt({ variant, className }: EmptyArtProps) {
  return (
    <span data-art={variant} className={cn("relative inline-flex size-24 shrink-0", className)}>
      <svg aria-hidden="true" viewBox="0 0 168 168" className="size-full">
        {variant === "add" && (
          <>
            <rect x="44" y="0" {...SQUARE} className="fill-brand-soft" />
            <path
              d="M84 27v26M71 40h26"
              className="stroke-brand"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect x="0" y="88" {...SQUARE} {...DASHED} className="stroke-muted-foreground" />
            <rect x="88" y="88" {...SQUARE} {...DASHED} className="stroke-muted-foreground" />
          </>
        )}
        {variant === "search" && (
          <>
            <rect x="44" y="0" {...SQUARE} className="fill-border" />
            <rect x="0" y="88" {...SQUARE} className="fill-border" />
            <rect x="88" y="88" {...SQUARE} {...DASHED} className="stroke-muted-foreground" />
          </>
        )}
        {variant === "outline" && (
          <>
            <rect x="44" y="0" {...SQUARE} {...DASHED} className="stroke-brand" />
            <rect x="0" y="88" {...SQUARE} {...DASHED} className="stroke-brand" />
            <rect x="88" y="88" {...SQUARE} {...DASHED} className="stroke-brand" />
          </>
        )}
        {variant === "missing" && (
          <>
            <rect
              x="47"
              y="3"
              width="74"
              height="74"
              rx="22"
              fill="none"
              strokeWidth="5"
              strokeDasharray="12 10"
              className="stroke-muted-foreground"
            />
            <rect x="0" y="88" {...SQUARE} className="fill-brand" />
            <rect
              x="93"
              y="93"
              width="70"
              height="70"
              rx="19"
              fill="none"
              strokeWidth="10"
              className="stroke-brand"
            />
          </>
        )}
      </svg>
      {variant === "search" && (
        <span
          aria-hidden="true"
          className="absolute -right-2 bottom-0 flex size-9 items-center justify-center rounded-xl bg-card text-brand-text shadow-md"
        >
          <SearchIcon className="size-4.5" strokeWidth={2.2} />
        </span>
      )}
    </span>
  );
}
