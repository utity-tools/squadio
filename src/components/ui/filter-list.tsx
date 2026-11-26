"use client";

import { SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyArt, EmptyState } from "@/components/ui/empty-state";

// ADR 0017's list pattern, as GitHub's issues: a search above one bordered box whose grey header
// holds the tabs with their counts, and the order and filter menus; one row per item; and, when
// the filters leave nothing, «Ningún … coincide» with «Quitar filtros». Projects and people use it.

/**
 * A list's state, kept in the URL so a link or a reload opens the list as it was left. The URL
 * seeds it, and each change is written back without a trip to the server: a new history entry
 * for a tab, an order or a filter, so Back undoes it, and the same entry for each key of a
 * search. Back and Forward read it again, and so does a link that changes the URL, such as the
 * sidebar's to the plain list. Its own writes never read it back: the router tells
 * `useSearchParams` about them inside a transition, which can land behind the next key.
 */
export function useListQuery<Q>(
  read: (query: URLSearchParams) => Q,
  write: (current: URLSearchParams, query: Q) => string,
) {
  const params = useSearchParams();
  const current = params.toString();
  const [query, setQuery] = useState<Q>(() => read(new URLSearchParams(params)));
  const [seen, setSeen] = useState({ url: current, written: [] as readonly string[] });
  if (current !== seen.url) {
    const own = seen.written.includes(current);
    setSeen({ url: current, written: own ? seen.written : [] });
    if (!own) setQuery(read(new URLSearchParams(params)));
  }

  useEffect(() => {
    const back = () => setQuery(read(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [read]);

  function change(next: Q, history: "push" | "replace" = "push") {
    setQuery(next);
    const { pathname, search, hash } = window.location;
    const written = write(new URLSearchParams(search), next);
    // Radix chooses a tab on the press and again on the focus that follows: one entry, not two.
    if (written === search) return;
    setSeen((before) => ({ ...before, written: [...before.written, written.slice(1)] }));
    const url = `${pathname}${written}${hash}`;
    if (history === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  return [query, change] as const;
}

/** A tab of the box's header: the active one in bold. */
const LIST_TAB =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors duration-(--duration-fast) ease-snappy hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-foreground motion-reduce:transition-none";

type FilterListProps<T extends string> = {
  /** Names the search field, and is its placeholder. */
  searchLabel: string;
  search: string;
  onSearch: (search: string) => void;
  /** Names the tabs. */
  tabsLabel: string;
  tabs: readonly { tab: T; label: string; count: number }[];
  tab: T;
  onTab: (tab: T) => void;
  /** The order and filter menus, at the header's end. */
  menus?: ReactNode;
  /** Names the list of rows. */
  label: string;
  /** One `li` per item, already filtered and ordered; none draws the empty state. */
  rows: readonly ReactNode[];
  /** Says, for screen readers, how many items are shown. */
  status: string;
  empty: { title: string; description: string; clear: string };
  onClear: () => void;
};

/** The search, then the bordered box: tabs and menus in its grey header, then the rows. */
export function FilterList<T extends string>({
  searchLabel,
  search,
  onSearch,
  tabsLabel,
  tabs,
  tab,
  onTab,
  menus,
  label,
  rows,
  status,
  empty,
  onClear,
}: FilterListProps<T>) {
  const searchField = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <SearchField label={searchLabel} value={search} onChange={onSearch} input={searchField} />
      <Tabs.Root
        // Arrows move between tabs and Enter or Space chooses one: each choice is a history entry.
        activationMode="manual"
        value={tab}
        onValueChange={(value) => {
          const next = tabs.find((t) => t.tab === value);
          if (next) onTab(next.tab);
        }}
      >
        <div className="overflow-hidden rounded-[12px] border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1.5">
            <Tabs.List aria-label={tabsLabel} className="flex flex-wrap gap-1">
              {tabs.map(({ tab: value, label: name, count }) => (
                <Tabs.Trigger key={value} value={value} className={LIST_TAB}>
                  {name} <TabCount count={count} />
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {menus && <div className="flex items-center gap-1">{menus}</div>}
          </div>
          {tabs.map(({ tab: value }) => (
            <Tabs.Content key={value} value={value}>
              {value !== tab ? null : rows.length > 0 ? (
                <ul aria-label={label} className="divide-y">
                  {rows}
                </ul>
              ) : (
                <EmptyState
                  level={2}
                  compact
                  className="py-10"
                  art={<EmptyArt variant="search" className="size-16" />}
                  title={empty.title}
                  description={empty.description}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onClear();
                        // The button goes with the empty state: the search keeps the focus.
                        searchField.current?.focus();
                      }}
                    >
                      {empty.clear}
                    </Button>
                  }
                />
              )}
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  );
}

/** How many items a tab holds. */
function TabCount({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-foreground/[0.08] px-1.5 text-xs font-medium text-foreground tabular-nums">
      {count}
    </span>
  );
}

/** The list's search field, named by its placeholder's words. */
function SearchField({
  label,
  value,
  onChange,
  input,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  input: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  return (
    <div role="search" aria-label={label} className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={input}
        id={id}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}
