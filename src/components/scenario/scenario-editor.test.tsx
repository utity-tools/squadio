import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { StoreSpy } from "@/test/store-spy";

import {
  type ScenarioEditorProps,
  ScenarioEditor,
  ScenarioStoreProvider,
  useScenarioStore,
  useScenarioView,
} from "./scenario-editor";

const never = () => new Promise<SaveOutcome>(() => {});

/** Shows the developer's allocation as the views see it, and the store's history length. */
function Probe() {
  const view = useScenarioView();
  const store = useScenarioStore();
  const allocation = view.team.find((member) => member.id === developer.id)?.allocation;
  return (
    <p>
      {allocation}% · {store.getState().history.entries.length}
    </p>
  );
}

const props = (overrides: Partial<ScenarioEditorProps> = {}): ScenarioEditorProps => ({
  scenarioId: seatId(99),
  editing: { basis: hoursBasis, team, version: 3 },
  save: never,
  children: <Probe />,
  ...overrides,
});

function renderEditor(overrides: Partial<ScenarioEditorProps> = {}) {
  const stores: ScenarioStore[] = [];
  const onStore = (store: ScenarioStore) => {
    stores.push(store);
  };
  const ui = (more: Partial<ScenarioEditorProps> = {}) => (
    <ScenarioStoreProvider>
      <ScenarioEditor {...props({ ...overrides, ...more })}>
        <Probe />
        <StoreSpy onStore={onStore} />
      </ScenarioEditor>
    </ScenarioStoreProvider>
  );
  const view = render(ui());
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { store, rerender: (more: Partial<ScenarioEditorProps>) => view.rerender(ui(more)) };
}

describe("ScenarioEditor", () => {
  it("shows the saved team first", () => {
    renderEditor();
    expect(screen.getByText("100% · 0")).toBeInTheDocument();
  });

  it("shows each change the store applies", () => {
    const { store } = renderEditor();
    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });
    });
    expect(screen.getByText("50% · 1")).toBeInTheDocument();
  });

  it("keeps the history when the copy's page arrives, and takes the copy's basis", () => {
    const { store, rerender } = renderEditor();
    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });
      store.setState({ scenarioId: seatId(98) });
    });
    const copyBasis = {
      ...hoursBasis,
      scenario: { name: "Plan A", chosen: false, otherChosen: null },
    };
    rerender({ scenarioId: seatId(98), editing: { basis: copyBasis, team, version: 4 } });

    expect(screen.getByText("50% · 1")).toBeInTheDocument();
    expect(store.getState().basis).toBe(copyBasis);
  });

  it("keeps the copy's basis when the template's page is shown again", () => {
    const { store, rerender } = renderEditor();
    const copyBasis = {
      ...hoursBasis,
      scenario: { name: "Plan A", chosen: false, otherChosen: null },
    };
    act(() => {
      store.setState({ scenarioId: seatId(98), basis: copyBasis });
    });
    rerender({ scenarioId: seatId(99), editing: { basis: { ...hoursBasis }, team, version: 3 } });
    expect(store.getState().basis).toBe(copyBasis);
  });

  it("starts over for another scenario", () => {
    const { store, rerender } = renderEditor();
    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });
    });
    rerender({ scenarioId: seatId(97) });
    expect(screen.getByText("100% · 0")).toBeInTheDocument();
  });

  it("asks for the provider above it", () => {
    expect(() => render(<ScenarioEditor {...props()} />)).toThrow(/ScenarioStoreProvider/);
  });
});
