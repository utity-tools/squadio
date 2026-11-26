"use client";

import { ArrowUpDownIcon, FileSpreadsheetIcon, ListFilterIcon, UserIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterList, useListQuery } from "@/components/ui/filter-list";
import { InfoTip } from "@/components/ui/info-tip";
import { Link } from "@/i18n/navigation";
import {
  PEOPLE_ORDERS,
  type PeopleQuery,
  browsePeople,
  isOverbooked,
  peopleQuery,
  peopleQueryString,
} from "@/lib/lists/people";
import type { ListedPerson } from "@/lib/people/person-form";
import type { SmallCategory } from "@/lib/rates/small-categories";
import { cn } from "@/lib/utils";

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

const ALL = "all";

/**
 * The organization's people (board 07) as ADR 0017's list, GitHub's issues: the title with its
 * count and the actions at its right, a search, then one bordered box whose header holds the tabs
 * (active, free today, over 100 %, inactive, as GitHub's open and closed), a category filter and
 * the order; one row per person: category, area, weekly hours and today's occupancy. Never a
 * salary. With rate access a person of a category with 1 or 2 active people carries rule j's
 * warning. The search, tab, category and order live in the URL.
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
  const [saved, setSaved] = useState<string | null>(null);
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const locale = useLocale();
  const read = useCallback(
    (query: URLSearchParams) => peopleQuery(query, new Set(categories.map(({ id }) => id))),
    [categories],
  );
  const [query, setQuery] = useListQuery(read, peopleQueryString);
  const small = new Set(rates?.small.map((category) => category.categoryId));
  const sheetRates = rates && { pending: rates.pending, headcount: people };
  const canAdd = action && categories.length > 0;
  const { tabs, shown } = browsePeople(people, names, query, locale);

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

  const change = (next: Partial<PeopleQuery>) => setQuery({ ...query, ...next });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-baseline gap-2 text-[26px] font-semibold tracking-tight">
            {t("title")}
            <span className="text-base font-normal text-muted-foreground">
              {t("count", { count: people.length })}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {action && (
          <div className="flex flex-wrap items-center gap-2">
            {/* ADR 0016: or bring them all from a spreadsheet; it creates a missing category. */}
            <Link
              href={{ pathname: "/import", query: { file: "people" } }}
              className={buttonVariants({ variant: "outline" })}
            >
              <FileSpreadsheetIcon aria-hidden="true" />
              {t("import")}
            </Link>
            {canAdd && sheet()}
          </div>
        )}
      </div>

      {people.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-[12px] border border-dashed p-6 text-sm">
          <p className="font-medium">{t("empty")}</p>
          {categories.length === 0 && <p className="text-muted-foreground">{t("needsCategory")}</p>}
        </div>
      ) : (
        <FilterList
          searchLabel={t("list.search")}
          search={query.search}
          onSearch={(search) => setQuery({ ...query, search }, "replace")}
          tabsLabel={t("list.tabs.label")}
          tabs={tabs.map(({ tab, count }) => ({ tab, count, label: t(`list.tabs.${tab}`) }))}
          tab={query.tab}
          onTab={(tab) => change({ tab })}
          menus={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ListFilterIcon aria-hidden />
                    {query.category === null
                      ? t("list.category.label")
                      : t("list.category.chosen", { category: names.get(query.category) ?? "" })}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t("list.category.title")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={query.category ?? ALL}
                    onValueChange={(value) => change({ category: value === ALL ? null : value })}
                  >
                    <DropdownMenuRadioItem value={ALL}>
                      {t("list.category.all")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    {categories.map((category) => (
                      <DropdownMenuRadioItem key={category.id} value={category.id}>
                        {category.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ArrowUpDownIcon aria-hidden />
                    {t("list.sort.label", { order: t(`list.sort.${query.order}`) })}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t("list.sort.title")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={query.order}
                    onValueChange={(value) => {
                      const order = PEOPLE_ORDERS.find((o) => o === value);
                      if (order) change({ order });
                    }}
                  >
                    {PEOPLE_ORDERS.map((order) => (
                      <DropdownMenuRadioItem key={order} value={order}>
                        {t(`list.sort.${order}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
          label={t("title")}
          rows={shown.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-4 px-4 py-3 transition-colors duration-(--duration-fast) ease-snappy hover:bg-muted/40 motion-reduce:transition-none"
            >
              <UserIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 self-start text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold wrap-anywhere">{person.name}</span>
                  {!person.active && <Chip tone="muted">{t("inactive")}</Chip>}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
                  <span>{names.get(person.categoryId)}</span>
                  {person.area !== null && <span>· {person.area}</span>}
                  <span>· {t("hours", { hours: format.number(person.weeklyHours) })}</span>
                  {small.has(person.categoryId) && (
                    <Chip tone="warn" title={t("small")}>
                      <span aria-hidden>{t("smallShort")}</span>
                      <span className="sr-only">{t("small")}</span>
                    </Chip>
                  )}
                </div>
              </div>
              <Occupancy percent={person.occupancy} />
              {action && <div className="shrink-0">{sheet(person)}</div>}
            </li>
          ))}
          status={t("list.count", { count: shown.length })}
          empty={{
            title: t("list.none.title"),
            description: t("list.none.description"),
            clear: t("list.none.clear"),
          }}
          onClear={() => setQuery(read(new URLSearchParams()))}
        />
      )}
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <InfoTip label={t("occupancyInfo")} title={t("columns.occupancy")}>
          {t("occupancyNote")}
        </InfoTip>
        {t("openRoles")}
      </p>
      <p role="status" className="text-[13px] text-status-ok-text empty:hidden">
        {saved && t("saved", { name: saved })}
      </p>
    </div>
  );
}

/** Today's occupancy: its percent and a thin bar, amber past 100 %. */
function Occupancy({ percent }: { percent: number }) {
  const t = useTranslations("People");
  const format = useFormatter();
  const over = isOverbooked(percent);
  return (
    <div className="flex w-28 shrink-0 flex-col items-end gap-1">
      <span
        className={cn(
          "text-sm whitespace-nowrap tabular-nums",
          percent === 0 ? "text-muted-foreground" : "font-semibold",
          over && "text-status-warn-text",
        )}
      >
        {t("occupancyToday", { percent: format.number(percent / 100, { style: "percent" }) })}
      </span>
      <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", over ? "bg-status-warn" : "bg-brand")}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </span>
    </div>
  );
}
