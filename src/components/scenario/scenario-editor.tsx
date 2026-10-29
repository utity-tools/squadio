"use client";

import {
  type ReactNode,
  type RefObject,
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";

import { TeamDragProvider } from "@/components/team-drag/team-drag";
import type { Member } from "@/lib/scenarios/change";
import {
  type LoadedScenario,
  type ScenarioBasis,
  scenarioView,
} from "@/lib/scenarios/scenario-view";
import type { ScenarioStore, ScenarioStoreInit } from "@/lib/scenarios/store";
import { type StoreRegistry, createStoreRegistry } from "@/lib/scenarios/store-registry";

const RegistryContext = createContext<StoreRegistry | null>(null);
const StoreContext = createContext<ScenarioStore | null>(null);
const ViewContext = createContext<LoadedScenario | null>(null);

/**
 * The choice a page sent and has not yet shown as made: whether the scenario ends up chosen, or
 * null. It lives above the page, so the copy's page, after the move a first choice makes, can
 * give the focus back and say the choice was made.
 */
export type PendingChoice = RefObject<boolean | null>;

const PendingChoiceContext = createContext<PendingChoice | null>(null);

/**
 * Holds the scenario store above the scenario page, in the section's layout, so the redirect to
 * the visitor's copy after the first save keeps the history (ADR 0011, slice 3).
 */
export function ScenarioStoreProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createStoreRegistry);
  const pendingChoice = useRef<boolean | null>(null);
  return (
    <RegistryContext value={registry}>
      <PendingChoiceContext value={pendingChoice}>{children}</PendingChoiceContext>
    </RegistryContext>
  );
}

/** The choice the page sent and has not shown as made yet, kept across the move to the copy. */
export function usePendingChoice(): PendingChoice {
  const pending = use(PendingChoiceContext);
  if (!pending) throw new Error("usePendingChoice needs a ScenarioStoreProvider above it");
  return pending;
}

export type ScenarioEditorProps = {
  scenarioId: string;
  /** What the loader returns to edit the scenario: its basis, its saved team and version. */
  editing: { basis: ScenarioBasis; team: Member[]; version: number };
  /** The Server Action that saves the store's changes. */
  save: ScenarioStoreInit["save"];
  children: ReactNode;
};

/**
 * Gives the page's views the scenario's store and what they show, recalculated once per change
 * with the same `scenarioView` the loader ran on the server, so the first render matches it.
 */
export function ScenarioEditor({ scenarioId, editing, save, children }: ScenarioEditorProps) {
  const registry = use(RegistryContext);
  if (!registry) throw new Error("ScenarioEditor needs a ScenarioStoreProvider above it");
  const store = registry.obtain({ scenarioId, ...editing, save });

  // The copy's page brings the copy's basis: the store takes it, keeping its history. The
  // template's page, shown again after the move, keeps the copy's: its ids are the template's.
  useEffect(() => {
    const state = store.getState();
    if (state.scenarioId === scenarioId && state.basis !== editing.basis) {
      state.adopt(editing.basis);
    }
  }, [store, scenarioId, editing.basis]);

  const basis = useStore(store, (state) => state.basis);
  const team = useStore(store, (state) => state.history.team);
  const view = useMemo(() => scenarioView(basis, team), [basis, team]);

  return (
    <StoreContext value={store}>
      <ViewContext value={view}>
        <TeamDragProvider>{children}</TeamDragProvider>
      </ViewContext>
    </StoreContext>
  );
}

/** The scenario's store, for the controls that change it. */
export function useScenarioStore(): ScenarioStore {
  const store = use(StoreContext);
  if (!store) throw new Error("useScenarioStore needs a ScenarioEditor above it");
  return store;
}

/** What the views show for the store's current team. */
export function useScenarioView(): LoadedScenario {
  const view = use(ViewContext);
  if (!view) throw new Error("useScenarioView needs a ScenarioEditor above it");
  return view;
}
