"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, createContext, use, useEffect, useRef, useState } from "react";

import { useScenarioStore, useScenarioView } from "@/components/scenario/scenario-editor";
import type { Change } from "@/lib/scenarios/change";
import { moveTargets } from "@/lib/scenarios/move-targets";
import { type StepFocus, stepFocus } from "@/lib/scenarios/step-focus";

import { AddMemberDialog } from "./add-member-dialog";
import { MoveMemberDialog } from "./move-member-dialog";

// Keyboard parity (canvas brief, "Keyboard and focus"; ADR 0008, point 4): every change to the
// team can be made from a menu or a dialog, and after each step a focus manager says where focus
// goes. The team views read this context; without it, or for a chosen scenario, they are read-only.

/** Where focus goes after a step, and whether to move it there or only select it. */
export type FocusRequest = {
  target: StepFocus;
  /** Tells one request from the next, even when they point at the same assignment. */
  nonce: number;
  /**
   * Whether to move focus: after a step made from the team's menus and dialogs, or while focus is
   * in the team. An undo from the header selects the assignment but leaves focus on the button.
   */
  move: boolean;
};

export type TeamEditing = {
  /** Opens the add dialog for a report of `reportsTo`, or for the top of the team. */
  add: (reportsTo: string | null, from: HTMLElement | null) => void;
  /** Opens the move dialog for an assignment. */
  move: (id: string, from: HTMLElement | null) => void;
  /** Whether "Move to…" has anywhere to go. */
  canMove: (id: string) => boolean;
  /** Removes an assignment; its reports move up (docs/domain.md, "Changes"). */
  remove: (id: string) => void;
  /** The `name` an assignment's menu and dialogs give it. */
  nameOf: (id: string) => string;
  focusRequest: FocusRequest | null;
  /** Called once a view has acted on the request, so a view that mounts later ignores it. */
  focusDone: (nonce: number) => void;
  /** The team region: menus and dialogs render in it, so they stay inside the page's landmarks. */
  region: HTMLElement | null;
  /** The selected assignment and whether focus was in the team, kept across the move to the copy. */
  memory: () => FocusMemory;
  remember: (patch: Partial<FocusMemory>) => void;
  /** The copy's id for a template id the first save renamed; any other id as it is. */
  renameOf: (id: string) => string;
};

/**
 * What the views need again after the first save: the page then moves to the copy and draws the
 * team anew, which drops their selection and the focus. `focused` turns false only when focus
 * moves to something outside the team, not when the focused node itself goes away.
 */
export type FocusMemory = { selected: string | null; focused: boolean };

/** One memory per store, which outlives the page (it lives in the section's layout). */
const memories = new WeakMap<object, FocusMemory>();

const recall = (store: object): FocusMemory =>
  memories.get(store) ?? { selected: null, focused: false };

const TeamEditingContext = createContext<TeamEditing | null>(null);

/** The team's menus and focus manager; null where the team cannot be edited. */
export function useTeamEditing(): TeamEditing | null {
  return use(TeamEditingContext);
}

type Dialog =
  | { kind: "add"; reportsTo: string | null; from: HTMLElement | null }
  | { kind: "move"; id: string; from: HTMLElement | null };

/**
 * Gives the team views their menus and dialogs, and turns each step of the store into a focus
 * request. A chosen scenario's team cannot be edited, so it gets no context at all.
 */
export function TeamEditingProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("TeamEditing");
  const store = useScenarioStore();
  const view = useScenarioView();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const remember = (patch: Partial<FocusMemory>) =>
    void memories.set(store, { ...recall(store), ...patch });
  /** Set while a menu or dialog dispatches, so the step it takes moves focus. */
  const ownStep = useRef(false);
  /** Counts requests, also across the ones views have done with. */
  const requests = useRef(0);

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const target = stepFocus(previous.history, state.history);
        if (!target) return;
        const active = document.activeElement;
        const move =
          ownStep.current ||
          active === null ||
          active === document.body ||
          // The team region (ScenarioTeam).
          active.closest("[data-team-region]") !== null;
        requests.current += 1;
        setFocusRequest({ target, nonce: requests.current, move });
      }),
    [store],
  );

  if (view.scenario.chosen) return children;

  /** Dispatches from a menu or dialog: the step moves focus. */
  function dispatchOwn(change: Change) {
    ownStep.current = true;
    try {
      return store.getState().dispatch(change);
    } finally {
      ownStep.current = false;
    }
  }

  const members = new Map(view.team.map((member) => [member.id, member]));
  const nameOf = (id: string) => {
    const member = members.get(id);
    if (!member) return t("someAssignment");
    return t("member", {
      role: member.projectRole || member.category.name,
      person: member.person?.name ?? t("openRole"),
    });
  };

  const editing: TeamEditing = {
    add: (reportsTo, from) => setDialog({ kind: "add", reportsTo, from }),
    move: (id, from) => setDialog({ kind: "move", id, from }),
    canMove: (id) => {
      const targets = moveTargets(store.getState().history.team, id);
      return targets.root || targets.managers.length > 0;
    },
    remove: (id) => void dispatchOwn({ type: "remove", id }),
    nameOf,
    focusRequest,
    focusDone: (nonce) => setFocusRequest((last) => (last?.nonce === nonce ? null : last)),
    region,
    memory: () => recall(store),
    remember,
    renameOf: (id) => store.getState().renamed[id] ?? id,
  };

  /** Closes a dialog; after a cancel, focus goes back to where it was opened from. */
  function close(done: boolean) {
    const from = dialog?.from;
    setDialog(null);
    if (!done) requestAnimationFrame(() => from?.focus());
  }

  return (
    <TeamEditingContext value={editing}>
      {/* A step taken while focus is in here moves focus with it. */}
      <div
        ref={setRegion}
        data-team-region=""
        className="h-full"
        onFocus={() => remember({ focused: true })}
        onBlur={(event) => {
          // No related target: the window lost focus, or the focused node went away.
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next)) {
            remember({ focused: false });
          }
        }}
      >
        {children}
      </div>
      {dialog?.kind === "add" && (
        <AddMemberDialog
          reportsTo={dialog.reportsTo}
          managerName={dialog.reportsTo === null ? null : nameOf(dialog.reportsTo)}
          dispatch={dispatchOwn}
          onClose={close}
          container={region}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveMemberDialog
          id={dialog.id}
          nameOf={nameOf}
          dispatch={dispatchOwn}
          onClose={close}
          container={region}
        />
      )}
    </TeamEditingContext>
  );
}
