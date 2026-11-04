import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

/**
 * A form control's look (ADR 0014): 36 px, radius 8, on the input's border. Focus rings it, an
 * invalid value rings it in the bad status, and what cannot be changed is dashed on --muted.
 * Numbers sit right-aligned in Geist Mono.
 */
export function controlClassName({ numeric = false }: { numeric?: boolean } = {}) {
  return cn(
    "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground transition-[border-color,box-shadow] duration-(--duration-fast) ease-snappy placeholder:text-muted-foreground motion-reduce:transition-none",
    // The app-wide 2 px focus outline rings it; the border joins in.
    "focus-visible:border-ring",
    "aria-invalid:border-status-bad aria-invalid:ring-3 aria-invalid:ring-status-bad/18",
    // Only text that cannot be typed in: CSS's :read-only also matches every <select>.
    "[&:is(input,textarea):read-only]:border-dashed [&:is(input,textarea):read-only]:bg-muted",
    numeric && "text-right font-mono tabular-nums",
  );
}

/** The props that tie a field's control to its label, help and error. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  label: ReactNode;
  /** Below the control while there is no error. */
  help?: ReactNode;
  /** Replaces the help, and marks the control invalid. */
  error?: ReactNode;
  /** Marks the field "Optional" beside its label. */
  optional?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/** Label above, the control, help below; the error replaces the help. */
export function Field({ label, help, error, optional = false, className, children }: FieldProps) {
  const t = useTranslations("Field");
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? help;

  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex justify-between gap-2 text-sm font-medium">
        <span>{label}</span>
        {/* A space, so the name reads "Description Optional" rather than run together. */}
        {optional && " "}
        {optional && (
          <span className="text-[13px] font-normal text-muted-foreground">{t("optional")}</span>
        )}
      </label>
      {children({
        id,
        ...(note ? { "aria-describedby": noteId } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })}
      {note && (
        <p
          id={noteId}
          className={cn("text-[13px]", error ? "text-status-bad-text" : "text-muted-foreground")}
        >
          {note}
        </p>
      )}
    </div>
  );
}
