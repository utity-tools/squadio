import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

// Shared by both summaries, with and without rate access: formats only, never data.

/** The figures' formats: whole euros, percentages to one decimal, hours to two. */
export function useSummaryFormat() {
  const t = useTranslations("Summary");
  const format = useFormatter();
  const currency = (cents: number, fractionDigits: number) =>
    format.number(cents / 100, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  return {
    euros: (cents: number) => currency(cents, 0),
    /** Cost per hour and the effective rate, which the engine rounds to cents. */
    cents: (cents: number) => currency(cents, 2),
    rate: (cents: number) => t("rate", { amount: currency(cents, 2) }),
    percent: (basisPoints: number) =>
      format.number(basisPoints / 10_000, { style: "percent", maximumFractionDigits: 1 }),
    hours: (value: number) =>
      t("hours", { hours: format.number(value, { maximumFractionDigits: 2 }) }),
  };
}

/** A labelled figure of a `dl`. */
export function Figure({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
