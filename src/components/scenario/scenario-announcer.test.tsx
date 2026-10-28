import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, lead, manager, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { ScenarioAnnouncer } from "./scenario-announcer";
import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";

const never = () => new Promise<SaveOutcome>(() => {});

function renderAnnouncer(basis: ScenarioBasis = ratesBasis) {
  const stores: ScenarioStore[] = [];
  const { container } = renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor scenarioId={seatId(99)} editing={{ basis, team, version: 1 }} save={never}>
        <ScenarioAnnouncer />
        <StoreSpy
          onStore={(store) => {
            stores.push(store);
          }}
        />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
  );
  const store = stores[0];
  const region = container.querySelector("[aria-live='polite']");
  if (!store || !region) throw new Error("expected a store and a live region");
  return { store, region };
}

const halve = { type: "edit", id: developer.id, set: { allocation: 50 } } as const;

describe("ScenarioAnnouncer", () => {
  it("is silent until something happens", () => {
    const { region } = renderAnnouncer();
    expect(region).toBeEmptyDOMElement();
  });

  it("says the new net margin after a change, and again after its undo", () => {
    const { store, region } = renderAnnouncer();
    act(() => {
      store.getState().dispatch(halve);
    });
    expect(region.textContent).toMatch(/^Margen neto: [\d.]+\s€ \(/);
    const first = region.firstElementChild;

    act(() => {
      store.getState().undo();
    });
    expect(region.textContent).toMatch(/^Deshecho\. Margen neto: /);
    // A new node each time, so the screen reader speaks it even when its text repeats.
    expect(region.firstElementChild).not.toBe(first);

    act(() => {
      store.getState().redo();
    });
    expect(region.textContent).toMatch(/^Rehecho\. Margen neto: /);
  });

  it("says nothing when a save renames the team's ids", () => {
    const { store, region } = renderAnnouncer();
    act(() => {
      store.getState().dispatch(halve);
    });
    const before = region.firstElementChild;
    const { history } = store.getState();
    act(() => {
      store.setState({
        history: { ...history, team: [...history.team], entries: [...history.entries] },
      });
    });
    expect(region.firstElementChild).toBe(before);
  });

  it("says why a step was refused", () => {
    const { store, region } = renderAnnouncer();
    act(() => {
      store.getState().dispatch({ type: "move", id: manager.id, reportsTo: lead.id });
    });
    expect(region).toHaveTextContent(
      "No se puede hacer el cambio: una asignación acabaría dependiendo de sí misma o de una que depende de ella",
    );
  });

  it("names the refused action for undo and redo", () => {
    const { store, region } = renderAnnouncer();
    act(() => {
      store.setState({ rejection: { action: "undo", reason: "inactive-person" } });
    });
    expect(region).toHaveTextContent("No se puede deshacer: la persona no está activa");
  });

  it("says the effective hours without rate access, never money", () => {
    const { store, region } = renderAnnouncer(hoursBasis);
    act(() => {
      store.getState().dispatch(halve);
    });
    expect(region.textContent).toMatch(/^Horas efectivas: /);
    expect(region.textContent).not.toContain("€");
  });
});
