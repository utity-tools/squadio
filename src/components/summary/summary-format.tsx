import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { Amount } from "@/lib/summary/summary";

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

/**
 * Why a line has no amount: what an undetermined one misses, or why one does not apply
 * (docs/domain.md, "Partial results"). `ownRate` shortens a category's own line to "Missing the cost",
 * since the category names the line.
 */
export function useWhyNoAmount() {
  const t = useTranslations("Summary");
  const format = useFormatter();
  return (amount: Exclude<Amount, number>, { ownRate = false } = {}) => {
    if (amount.state === "notApplicable") return t(`reasons.${amount.reason}`);
    const { categories, price } = amount.missing;
    if (categories.length === 0) {
      // The engine never leaves a line undetermined without naming what it misses.
      if (!price) throw new Error("An undetermined line misses nothing");
      return t("missing.price");
    }
    if (ownRate) return t("missing.ownRate");
    const values = { categories: format.list(categories), count: categories.length };
    // Only a fixed price can be missing, and its revenue never misses a rate: the rates are costs.
    if (price) return t("missing.rateAndPrice", values);
    const key = { cost: "rate", sellRate: "sellRate", both: "rateAndSellRate" } as const;
    return t(`missing.${key[amount.missing.rates]}`, values);
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
