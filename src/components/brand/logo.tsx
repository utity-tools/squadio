import { cn } from "@/lib/utils";

type LogoProps = {
  /** The word next to the mark; off, the mark stands alone; "from-sm", only from `sm` up. */
  wordmark?: boolean | "from-sm";
  className?: string;
};

/**
 * The placeholder brand (ADR 0014, "Marca (provisional)"), until the final logo arrives: three
 * squares, two filled in --brand and the third outlined in it, as the boards draw it, and
 * "squadio" in the heading face. It is decoration: the link around it gives the name.
 */
export function Logo({ wordmark = true, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <svg aria-hidden="true" viewBox="0 0 168 168" className="size-6 shrink-0">
        <rect x="44" y="0" width="80" height="80" rx="24" fill="var(--brand)" />
        <rect x="0" y="88" width="80" height="80" rx="24" fill="var(--brand)" />
        <rect
          x="93"
          y="93"
          width="70"
          height="70"
          rx="19"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="10"
        />
      </svg>
      {wordmark && (
        <span
          aria-hidden="true"
          className={cn(
            "font-heading text-[17px] leading-none font-extrabold tracking-[-0.04em]",
            wordmark === "from-sm" && "max-sm:hidden",
          )}
        >
          squadio
        </span>
      )}
    </span>
  );
}
