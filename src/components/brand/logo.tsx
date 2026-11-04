import { cn } from "@/lib/utils";

type LogoProps = {
  /** The word next to the mark; off, the mark stands alone. */
  wordmark?: boolean;
  className?: string;
};

/**
 * The placeholder brand (ADR 0014, "Marca (provisional)"), until the final logo arrives: three
 * squares, two filled in --brand and the light one outlined in --brand-soft, and "squadio" in the
 * heading face. It is decoration: the link around it gives the name.
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
          stroke="var(--brand-soft)"
          strokeWidth="10"
        />
      </svg>
      {wordmark && (
        <span
          aria-hidden="true"
          className="font-heading text-[17px] leading-none font-extrabold tracking-[-0.04em]"
        >
          squadio
        </span>
      )}
    </span>
  );
}
