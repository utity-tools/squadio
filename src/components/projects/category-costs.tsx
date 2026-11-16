"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { TermInfo, useSummaryFormat } from "@/components/summary/summary-format";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelTitle } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeCategory } from "@/lib/categories/category-summary";
import type { PricingModel } from "@/lib/projects/new-project";
import type { CategoryRateValues } from "@/lib/categories/category-form";
import { type HeadcountPerson, findSmallCategories } from "@/lib/rates/small-categories";

import { CategorySheet, type SaveCategoryAction } from "./category-sheet";

type CategoryCostsProps = {
  netAnnualHours: number;
  /** The organization's categories, by name; a category without a rate has `rate: null`. */
  categories: { id: string; name: string; rate: CategoryRateValues | null }[];
  /** Everyone rule j counts, for the small-category warning. */
  people: HeadcountPerson[];
  pricingModel: PricingModel;
  /** Only a signed-in member with rate access may write a rate (ADR 0005); none for others. */
  action: SaveCategoryAction | null;
};

/**
 * «Categorías y costes» (board 06): the organization's categories with their fully loaded cost,
 * cost per hour and sell rate, read only with rate access. A category without a rate is pending
 * (rule k); one with 1 or 2 active people warns that its cost may reveal a salary (rule j).
 */
export function CategoryCosts({
  netAnnualHours,
  categories,
  people,
  pricingModel,
  action,
}: CategoryCostsProps) {
  const t = useTranslations("Project.categories");
  const { euros, cents } = useSummaryFormat();
  const titleId = useId();
  const [saved, setSaved] = useState<string | null>(null);
  const small = new Set(findSmallCategories(people).map((category) => category.categoryId));
  const perHour = (amount: number) => t("perHour", { amount: cents(amount) });

  return (
    <Panel aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <PanelTitle id={titleId}>{t("title")}</PanelTitle>
          <p className="text-[13px] text-muted-foreground">{t("description")}</p>
        </div>
        {action && <CategorySheet action={action} onSaved={setSaved} />}
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {/* Narrow windows scroll the table: the keyboard reaches the scroller, so every column. */}
          <div
            role="group"
            aria-labelledby={titleId}
            tabIndex={0}
            className="overflow-x-auto rounded-[12px]"
          >
            <Table aria-labelledby={titleId} className="min-w-160">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("columns.category")}</TableHead>
                  <TableHead scope="col" numeric>
                    <TermInfo term="fullyLoaded" name={t("columns.fullyLoaded")} />
                    {t("columns.fullyLoaded")}
                  </TableHead>
                  <TableHead scope="col" numeric>
                    <TermInfo term="costPerHour" name={t("columns.costPerHour")} />
                    {t("columns.costPerHour")}
                  </TableHead>
                  <TableHead scope="col" numeric>
                    {t("columns.sellRate")}
                  </TableHead>
                  <TableHead scope="col">{t("columns.status")}</TableHead>
                  {action && (
                    <TableHead scope="col">
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => {
                  const summary = summarizeCategory(category.rate, netAnnualHours);
                  return (
                    <TableRow key={category.id}>
                      <TableCell className="font-semibold wrap-anywhere">{category.name}</TableCell>
                      {summary.status === "complete" ? (
                        <>
                          <TableCell numeric>{euros(summary.fullyLoadedCents)}</TableCell>
                          <TableCell numeric>
                            {perHour(summary.costPerHourCents)}
                            {summary.manualCostPerHour && (
                              <span className="ms-1 font-sans text-[12px] text-muted-foreground">
                                ({t("manual")})
                              </span>
                            )}
                          </TableCell>
                          <TableCell numeric>{perHour(summary.sellRateCents)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell numeric aria-label={t("pending")}>
                            —
                          </TableCell>
                          <TableCell numeric aria-label={t("pending")}>
                            —
                          </TableCell>
                          <TableCell numeric aria-label={t("pending")}>
                            —
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {summary.status === "complete" ? (
                            <Chip tone="ok">{t("complete")}</Chip>
                          ) : (
                            <>
                              <Chip tone="pending">{t("pending")}</Chip>
                              <span className="text-[13px] text-muted-foreground">
                                {t("missingCost")}
                              </span>
                            </>
                          )}
                          {small.has(category.id) && <Chip tone="warn">{t("small")}</Chip>}
                        </span>
                      </TableCell>
                      {action && (
                        <TableCell className="text-end">
                          <CategorySheet action={action} category={category} onSaved={setSaved} />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-[13px] text-muted-foreground">{t(`note.${pricingModel}`)}</p>
        </>
      )}
      <p role="status" className="text-[13px] text-status-ok-text empty:hidden">
        {saved && t("saved", { name: saved })}
      </p>
    </Panel>
  );
}
