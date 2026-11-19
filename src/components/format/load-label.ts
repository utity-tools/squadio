"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { LoadFigure } from "@/lib/load/weekly-load";

/**
 * A week's load as text (docs/domain.md, "Load in a week"): a whole percent, or «>100 %» when
 * over-allocated but rounding to 100, so an over-allocated week never reads 100%.
 */
export function useLoadLabel() {
  const t = useTranslations("Load");
  const format = useFormatter();
  return (figure: LoadFigure) => {
    const percent = format.number(figure.percent / 100, { style: "percent" });
    return figure.aboveHundred ? t("aboveHundred", { percent }) : percent;
  };
}
