"use client";

import {
  GripVerticalIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserRoundSearchIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useStore } from "zustand";

import { useScenarioStore } from "@/components/scenario/scenario-editor";
import { useDragState, useTeamDrag } from "@/components/team-drag/team-drag";
import { Button } from "@/components/ui/button";
import {
  type BenchFilter,
  type BenchGroup,
  type BenchPerson,
  benchGroups,
} from "@/lib/bench/bench";
import type { Dragged } from "@/lib/scenarios/drop-action";
import { cn } from "@/lib/utils";

const FIELD =
  "h-8 w-full min-w-0 rounded-md border bg-transparent px-2 text-sm shadow-xs placeholder:text-muted-foreground dark:bg-input/30";

const NO_FILTER: BenchFilter = { query: "", categoryId: null };

/** How long the count waits for typing to stop before a screen reader hears it. */
const SETTLE_MS = 500;

/** `value`, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * The bench (docs/glossary.md): the organization's active people by category, how busy each is
 * today and whether the team already has them, with a search and a category filter. It holds no
 * money, so everyone sees it. People not on the team yet, and an open role of each category, can
 * be dragged into it; "Add to team…" lists them for the keyboard.
 */
export function Bench() {
  const t = useTranslations("Bench");
  const format = useFormatter();
  const store = useScenarioStore();
  const basis = useStore(store, (state) => state.basis);
  const team = useStore(store, (state) => state.history.team);
  const [filter, setFilter] = useState(NO_FILTER);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const categoryId = useId();

  const groups = benchGroups(basis, team, filter);
  const count = groups.reduce((sum, group) => sum + group.people.length, 0);
  const announced = useSettled(count, SETTLE_MS);
  const searching = filter.query.trim() !== "";
  const filtered = searching || filter.categoryId !== null;

  const clear = () => {
    setFilter(NO_FILTER);
    // The button goes away with the empty list, so the focus goes back to the search.
    searchRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="sr-only">{t("title")}</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="sr-only">
          {t("search")}
        </label>
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={filter.query}
            placeholder={t("search")}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
            className={cn(FIELD, "ps-8")}
          />
        </div>
        <label htmlFor={categoryId} className="sr-only">
          {t("category")}
        </label>
        <select
          id={categoryId}
          value={filter.categoryId ?? ""}
          onChange={(event) => setFilter({ ...filter, categoryId: event.target.value || null })}
          className={FIELD}
        >
          <option value="">{t("allCategories")}</option>
          {basis.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {/*
          The number of people the filter leaves follows each keystroke on screen; a screen reader
          hears it once typing stops, not once per letter.
        */}
        <p aria-hidden className="text-xs text-muted-foreground">
          {t("count", { count })}
        </p>
        <p role="status" className="sr-only">
          {t("count", { count: announced })}
        </p>
      </div>

      {/*
        Open roles can still be offered when no person is listed. A category with nobody in it,
        chosen without a search, says so in its heading.
      */}
      {count === 0 && (searching || !filtered) && (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p>{filtered ? t("empty") : t("none")}</p>
          {filtered && (
            <Button variant="outline" size="xs" onClick={clear}>
              {t("clear")}
            </Button>
          )}
        </div>
      )}
      {groups.map((group) => (
        <div key={group.category.id}>
          <h3 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold">
            <span>{group.category.name}</span>
            {/* A bare number says nothing to a screen reader: it hears "3 people". */}
            <span aria-hidden className="text-xs font-normal text-muted-foreground">
              {format.number(group.people.length)}
            </span>
            <span className="sr-only">{t("count", { count: group.people.length })}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {group.openRole && <OpenRoleCard category={group.category} />}
            {group.people.map((person) => (
              <BenchCard key={person.id} person={person} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BenchCard({ person }: { person: BenchPerson }) {
  const t = useTranslations("Bench");
  const format = useFormatter();
  const percent = format.number(person.occupancy / 100, { style: "percent" });
  const over = person.occupancy > 100;

  return (
    <DraggableCard
      dragged={{ kind: "person", personId: person.id }}
      label={person.name}
      // A person can be on a scenario only once (docs/domain.md, "Changes").
      canDrag={!person.onTeam}
      data-bench-person={person.id}
    >
      {/* The name gets the card's whole width, so it breaks between words, not inside them. */}
      <span className="font-medium wrap-break-word">{person.name}</span>
      {person.onTeam && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <UserCheckIcon aria-hidden className="size-3.5" />
          {t("onTeam")}
        </span>
      )}
      <p className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{t("occupancy", { percent })}</span>
        <span>{t("weeklyHours", { hours: format.number(person.weeklyHours) })}</span>
      </p>
      {/* The bar repeats the percentage above, which is what a screen reader reads. */}
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={cn("h-full rounded-full", over ? "bg-status-bad" : "bg-primary")}
          style={{ width: `${Math.min(person.occupancy, 100)}%` }}
        />
      </div>
      {over && (
        <p className="flex items-center gap-1 text-xs font-medium">
          <TriangleAlertIcon aria-hidden className="size-3.5 text-status-bad" />
          {t("overAllocated")}
        </p>
      )}
    </DraggableCard>
  );
}

/**
 * An open role of the group's category: dashed, as on the canvas. It joins the team with Config's
 * weekly hours, as often as it is dropped.
 */
function OpenRoleCard({ category }: { category: BenchGroup["category"] }) {
  const t = useTranslations("Bench");
  const format = useFormatter();
  const store = useScenarioStore();
  const weeklyHours = useStore(store, (state) => state.basis.defaultWeeklyHours);

  return (
    <DraggableCard
      dragged={{ kind: "openRole", categoryId: category.id }}
      label={t("openRoleOf", { category: category.name })}
      canDrag
      data-bench-open-role={category.id}
      className="border-2 border-dashed border-muted-foreground"
    >
      <span className="flex items-center gap-1 font-medium">
        <UserRoundSearchIcon aria-hidden className="size-3.5 shrink-0" />
        {/* The group's heading shows the category; a screen reader hears it with the card. */}
        <span aria-hidden>{t("openRole")}</span>
        <span className="sr-only">{t("openRoleOf", { category: category.name })}</span>
      </span>
      <p className="text-xs text-muted-foreground">
        {t("weeklyHours", { hours: format.number(weeklyHours) })}
      </p>
    </DraggableCard>
  );
}

/** Tells one dragged thing from another of the same kind. */
const dragKey = (dragged: Dragged) =>
  dragged.kind === "person"
    ? dragged.personId
    : dragged.kind === "openRole"
      ? dragged.categoryId
      : dragged.id;

/**
 * A bench card the team takes drops of (ADR 0008, point 1). A mouse drags the whole card; a finger
 * drags the grip, so the bench still scrolls. The keyboard's way in is "Add to team…".
 */
function DraggableCard({
  dragged,
  label,
  canDrag,
  className,
  children,
  ...data
}: {
  dragged: Extract<Dragged, { kind: "person" | "openRole" }>;
  /** What follows the pointer. */
  label: string;
  canDrag: boolean;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  const drag = useTeamDrag();
  const state = useDragState();
  const draggable = drag.enabled && canDrag;
  const dragging =
    state.dragged?.kind === dragged.kind && dragKey(state.dragged) === dragKey(dragged);

  return (
    <li
      {...data}
      onPointerDown={
        draggable
          ? (event) => {
              const onGrip =
                event.target instanceof Element && event.target.closest("[data-drag-grip]");
              if (event.pointerType !== "mouse" && !onGrip) return;
              drag.start(event, dragged, label);
            }
          : undefined
      }
      className={cn(
        "relative flex flex-col gap-1.5 rounded-md border bg-card p-2 text-sm shadow-xs",
        className,
        draggable && "cursor-grab ps-6 select-none",
        // Marked without fading it, which would fail contrast, and not by colour alone: an open
        // role's border is dashed already.
        dragging && "border-dashed border-primary ring-2 ring-primary",
      )}
    >
      {draggable && (
        <span
          aria-hidden
          data-drag-grip=""
          className="absolute inset-y-0 start-0 flex w-6 touch-none items-center justify-center text-muted-foreground"
        >
          <GripVerticalIcon className="size-3.5" />
        </span>
      )}
      {children}
    </li>
  );
}
