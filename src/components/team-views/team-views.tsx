"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AddToTeamButton } from "@/components/team-editing/add-to-team-button";
import { useTeamEditing } from "@/components/team-editing/team-editing";
import { TeamTable } from "@/components/team-table/team-table";
import { TeamCanvas } from "@/components/team-tree/team-canvas";
import type { LayoutNode } from "@/lib/layout/compact-layout";
import { revealRow } from "@/lib/team-table/rows";
import {
  type TeamView,
  collapsedInQuery,
  defaultView,
  queryWithCollapsed,
  queryWithView,
  viewInQuery,
} from "@/lib/team-views/query";
import type { AssignmentCard } from "@/lib/team-tree/cards";
import { treeNavigation } from "@/lib/team-tree/navigation";

import { ViewSwitch } from "./view-switch";

export type TeamViewsProps = {
  team: { id: string; reportsTo: string | null }[];
  nodes: LayoutNode[];
  cards: AssignmentCard[];
};

/** Tailwind's `md`: from here up the tree is the default view, below it the table. */
const WIDE_SCREEN = "(min-width: 48rem)";

let wideScreen: MediaQueryList | undefined;

/** The media query list, made once and only in the browser. */
function wideScreenQuery() {
  wideScreen ??= window.matchMedia(WIDE_SCREEN);
  return wideScreen;
}

function subscribeToWidth(onChange: () => void) {
  const media = wideScreenQuery();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Whether the screen is `md` or wider; null on the server and while hydrating. */
function useWideScreen(): boolean | null {
  return useSyncExternalStore(
    subscribeToWidth,
    () => wideScreenQuery().matches,
    () => null,
  );
}

/**
 * The two views of the team (canvas brief, "Screens"): the switch on top and only the chosen view
 * below. They share one selection, kept in memory, so the node selected in the tree is the row
 * selected in the table and the reverse. The view and the table's collapsed rows are mirrored in
 * the URL with `history.replaceState`: no new history entries and no trip to the server.
 *
 * Where the team can be edited, from `md` up (mobile is read-only), each node and row gets its
 * menu, the bar an "Add to team…" button, and the focus manager's requests select the assignment a
 * step touched and, when asked, focus it.
 */
export function TeamViews({ team, nodes, cards }: TeamViewsProps) {
  const query = useSearchParams();
  const ids = team.map(({ id }) => id);
  // The URL only seeds this state. The app router updates `useSearchParams` inside a transition,
  // so reading the view and the collapsed rows back from it would lag behind fast keys and clicks.
  const [view, setView] = useState<TeamView | null>(() => viewInQuery(query));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
    collapsedInQuery(query, ids),
  );
  const teamEditing = useTeamEditing();
  // After the move to the copy the views are drawn anew: they start from the remembered selection.
  const [selection, setSelection] = useState<string | null>(
    () => teamEditing?.memory().selected ?? null,
  );
  const wide = useWideScreen();
  const views = useRef<HTMLDivElement>(null);
  const editing = wide === true ? teamEditing : null;
  const request = editing?.focusRequest ?? null;
  const [handled, setHandled] = useState<number | null>(null);
  // Without a view in the URL the width decides, which the server cannot know: until the client
  // does, a placeholder holds the place, so neither view flashes nor fails to hydrate. The width
  // decides once: zooming in or turning a tablet must not unmount the view that has focus.
  if (view === null && wide !== null) setView(defaultView(wide));
  // A focus request selects the assignment a step touched, or the top of the team; in the table,
  // the managers above it expand. Focusing it waits for the render that draws it (below).
  if (request && request.nonce !== handled) {
    setHandled(request.nonce);
    const target = "id" in request.target ? request.target.id : treeNavigation(team, nodes).root;
    if (target !== null && ids.includes(target)) {
      setSelection(target);
      if (view === "table") setCollapsed(revealRow(team, collapsed, target));
    }
  }
  // A selection the first save renamed follows the assignment to the copy; one that left the
  // team selects nothing.
  const current =
    selection !== null && !ids.includes(selection) && teamEditing
      ? teamEditing.renameOf(selection)
      : selection;
  const selected = current !== null && ids.includes(current) ? current : null;

  useEffect(() => teamEditing?.remember({ selected }), [teamEditing, selected]);

  // Focus was in the team when its node went away: the first save renamed it, or the page moved
  // to the copy and drew the team anew. It goes back to the selected assignment.
  const idsKey = ids.join();
  useEffect(() => {
    const active = document.activeElement;
    if (!teamEditing?.memory().focused || selected === null) return;
    if (active !== null && active !== document.body) return;
    return focusWhenDrawn(views.current, selected);
    // Only when the team's ids change, which is when its nodes are drawn anew.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    if (!request || !editing) return;
    // The URL follows a row the request expanded.
    if (view === "table") writeQuery(view, collapsed);
    if (!request.move || selected === null) {
      editing.focusDone(request.nonce);
      return;
    }
    // The request is done once focus moved, or gave up: marking it done earlier would end this
    // effect, and its wait for the node, too soon.
    return focusWhenDrawn(views.current, selected, () => editing.focusDone(request.nonce));
    // Once per request: the selection and collapsed rows are those it just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  /** Mirrors the state in the URL, from the URL as it is now, keeping every other parameter. */
  function writeQuery(nextView: TeamView | null, nextCollapsed: ReadonlySet<string>) {
    const { pathname, search, hash } = window.location;
    let next = new URLSearchParams(search);
    if (nextView !== null) next = new URLSearchParams(queryWithView(next, nextView));
    const written = queryWithCollapsed(next, nextCollapsed, ids);
    window.history.replaceState(null, "", `${pathname}${written}${hash}`);
  }

  function changeView(next: TeamView) {
    // The selected row must be on screen in the table: expand the managers above it.
    const nextCollapsed =
      next === "table" && selected !== null ? revealRow(team, collapsed, selected) : collapsed;
    setView(next);
    setCollapsed(nextCollapsed);
    writeQuery(next, nextCollapsed);
  }

  function changeCollapsed(next: ReadonlySet<string>) {
    setCollapsed(next);
    writeQuery(viewInQuery(new URLSearchParams(window.location.search)), next);
  }

  return (
    <div ref={views} className="flex h-full flex-col">
      <ViewBar>
        <ViewSwitch view={view} onViewChange={changeView} />
        {editing && <AddToTeamButton editing={editing} />}
      </ViewBar>
      {view === "tree" && (
        <div className="min-h-96 flex-1">
          <TeamCanvas
            team={team}
            nodes={nodes}
            cards={cards}
            selected={selected}
            onSelect={setSelection}
            editing={editing}
          />
        </div>
      )}
      {view === "table" && (
        <div className="flex-1 bg-background">
          <TeamTable
            team={team}
            nodes={nodes}
            cards={cards}
            selected={selected}
            onSelect={setSelection}
            collapsed={collapsed}
            onCollapsedChange={changeCollapsed}
            editing={editing}
          />
        </div>
      )}
      {view === null && <ViewPlaceholder />}
    </div>
  );
}

/**
 * Focuses an assignment's node or row once it is drawn: the canvas may draw a new node a frame
 * late. Tries for a few frames, then calls `done` either way. Returns the cleanup that stops it.
 */
function focusWhenDrawn(views: HTMLElement | null, id: string, done?: () => void) {
  let tries = 0;
  let frame = requestAnimationFrame(function focus() {
    const element = views?.querySelector<HTMLElement>(
      `[data-assignment="${CSS.escape(id)}"], [data-row="${CSS.escape(id)}"]`,
    );
    element?.focus();
    if (element || ++tries >= 10) done?.();
    else frame = requestAnimationFrame(focus);
  });
  return () => cancelAnimationFrame(frame);
}

/** The views before the URL is known: the switch's place and a neutral block for either view. */
export function TeamViewsSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <div aria-hidden className="h-8 w-44 rounded-md border" />
      </ViewBar>
      <ViewPlaceholder />
    </div>
  );
}

function ViewBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2">
      {children}
    </div>
  );
}

/** A neutral block in the place of a view not chosen yet: it fits the tree and the table alike. */
function ViewPlaceholder() {
  return <div aria-hidden data-team-placeholder="" className="min-h-96 flex-1" />;
}
