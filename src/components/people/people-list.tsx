"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Chip } from "@/components/ui/chip";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ListedPerson } from "@/lib/people/person-form";
import type { SmallCategory } from "@/lib/rates/small-categories";

import { PersonSheet, type SavePersonAction } from "./person-sheet";

type PeopleListProps = {
  /** By name, with how busy each one is today. */
  people: readonly ListedPerson[];
  /** The organization's categories, by name. */
  categories: readonly { id: string; name: string }[];
  /** Config's weekly hours, which a new person starts with. */
  defaultWeeklyHours: number;
  /** With rate access, the pending categories and rule j's small ones; null without it. */
  rates: { pending: readonly string[]; small: readonly SmallCategory[] } | null;
  /** Only a signed-in member with rate access may write people (docs/domain.md, Person). */
  action: SavePersonAction | null;
};

/**
 * The organization's people (board 07): category, weekly hours, area, today's occupancy and
 * whether they are active. Never a salary. With rate access a person of a category with 1 or 2
 * active people carries rule j's warning.
 */
export function PeopleList({
  people,
  categories,
  defaultWeeklyHours,
  rates,
  action,
}: PeopleListProps) {
  const t = useTranslations("People");
  const format = useFormatter();
  const tableId = useId();
  const [saved, setSaved] = useState<string | null>(null);
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const small = new Set(rates?.small.map((category) => category.categoryId));
  const sheetRates = rates && { pending: rates.pending, headcount: people };
  const canAdd = action && categories.length > 0;

  const sheet = (person?: ListedPerson) =>
    action && (
      <PersonSheet
        action={action}
        categories={categories}
        rates={sheetRates}
        defaultWeeklyHours={defaultWeeklyHours}
        person={person}
        onSaved={setSaved}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {canAdd && sheet()}
      </div>

      {people.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-[12px] border border-dashed p-6 text-sm">
          <p className="font-medium">{t("empty")}</p>
          {categories.length === 0 && <p className="text-muted-foreground">{t("needsCategory")}</p>}
        </div>
      ) : (
        // Narrow windows scroll the table: the keyboard reaches the scroller, so every column.
        <div
          role="group"
          aria-labelledby={tableId}
          tabIndex={0}
          className="overflow-x-auto rounded-[12px] border"
        >
          <Table className="min-w-180">
            <caption id={tableId} className="sr-only">
              {t("title")}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t("columns.name")}</TableHead>
                <TableHead scope="col">{t("columns.category")}</TableHead>
                <TableHead scope="col" numeric>
                  {t("columns.weeklyHours")}
                </TableHead>
                <TableHead scope="col">{t("columns.area")}</TableHead>
                <TableHead scope="col" numeric>
                  <InfoTip label={t("occupancyInfo")} title={t("columns.occupancy")}>
                    {t("occupancyNote")}
                  </InfoTip>
                  {t("columns.occupancy")}
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
              {people.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="min-w-40 font-semibold wrap-break-word">
                    {person.name}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="wrap-anywhere">{names.get(person.categoryId)}</span>
                      {small.has(person.categoryId) && <Chip tone="warn">{t("small")}</Chip>}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    {t("hours", { hours: format.number(person.weeklyHours) })}
                  </TableCell>
                  {person.area === null ? (
                    <TableCell aria-label={t("noArea")} className="text-muted-foreground">
                      —
                    </TableCell>
                  ) : (
                    <TableCell className="wrap-anywhere">{person.area}</TableCell>
                  )}
                  <TableCell numeric>
                    {format.number(person.occupancy / 100, { style: "percent" })}
                  </TableCell>
                  <TableCell>
                    {person.active ? (
                      <Chip tone="ok">{t("active")}</Chip>
                    ) : (
                      <Chip tone="muted">{t("inactive")}</Chip>
                    )}
                  </TableCell>
                  {action && <TableCell className="text-end">{sheet(person)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">{t("openRoles")}</p>
      <p role="status" className="text-[13px] text-status-ok-text empty:hidden">
        {saved && t("saved", { name: saved })}
      </p>
    </div>
  );
}
