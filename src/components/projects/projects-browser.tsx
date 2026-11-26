"use client";

import { ArrowUpDownIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useCallback } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterList, useListQuery } from "@/components/ui/filter-list";
import {
  type BrowsedProject,
  PROJECT_ORDERS,
  browseProjects,
  projectsQuery,
  projectsQueryString,
} from "@/lib/lists/projects";

/** A project as the browser searches, filters and orders it, with its row drawn on the server. */
export type ListedProject = BrowsedProject & { row: ReactNode };

/**
 * The projects list's search, tabs and order (ADR 0017), kept in the URL. The money tabs and
 * the risk order exist only with rate access (ADR 0005).
 */
export function ProjectsBrowser({
  projects,
  rateAccess,
  label,
}: {
  projects: readonly ListedProject[];
  rateAccess: boolean;
  label: string;
}) {
  const t = useTranslations("Projects.list");
  const locale = useLocale();
  const read = useCallback(
    (query: URLSearchParams) => projectsQuery(query, rateAccess),
    [rateAccess],
  );
  const write = useCallback(
    (current: URLSearchParams, query: ReturnType<typeof read>) =>
      projectsQueryString(current, query, rateAccess),
    [rateAccess],
  );
  const [query, setQuery] = useListQuery(read, write);
  const { tabs, shown } = browseProjects(projects, query, rateAccess, locale);

  return (
    <FilterList
      searchLabel={t("search")}
      search={query.search}
      onSearch={(search) => setQuery({ ...query, search }, "replace")}
      tabsLabel={t("tabs.label")}
      tabs={tabs.map(({ tab, count }) => ({ tab, count, label: t(`tabs.${tab}`) }))}
      tab={query.tab}
      onTab={(tab) => setQuery({ ...query, tab })}
      menus={
        rateAccess && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowUpDownIcon aria-hidden />
                {t("sort.label", { order: t(`sort.${query.order}`) })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("sort.title")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={query.order}
                onValueChange={(value) => {
                  const order = PROJECT_ORDERS.find((o) => o === value);
                  if (order) setQuery({ ...query, order });
                }}
              >
                {PROJECT_ORDERS.map((order) => (
                  <DropdownMenuRadioItem key={order} value={order}>
                    {t(`sort.${order}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
      label={label}
      rows={shown.map((project) => (
        <li key={project.id}>{project.row}</li>
      ))}
      status={t("count", { count: shown.length })}
      empty={{ title: t("none.title"), description: t("none.description"), clear: t("none.clear") }}
      onClear={() => setQuery(projectsQuery(new URLSearchParams(), rateAccess))}
    />
  );
}
