import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";
import { LiveScenarioHeader, LiveScenarioSummary, LiveScenarioTeam } from "./scenario-live";

vi.mock("next/navigation", () => import("@/test/navigation"));

stubReactFlowLayout();

beforeEach(() => {
  stubScreen({ wide: false });
  stubHistory("/scenarios/plan?view=table");
});

const never = () => new Promise<SaveOutcome>(() => {});

function renderPage(basis: ScenarioBasis) {
  const stores: ScenarioStore[] = [];
  const view = renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor scenarioId={seatId(99)} editing={{ basis, team, version: 1 }} save={never}>
        <LiveScenarioHeader />
        <LiveScenarioTeam />
        <LiveScenarioSummary />
        <StoreSpy
          onStore={(found) => {
            stores.push(found);
          }}
        />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
  );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { ...view, store };
}

describe("the live scenario regions", () => {
  it("draw the header, the team and the summary from the store", () => {
    renderPage(ratesBasis);
    expect(screen.getByRole("heading", { level: 1, name: "Plan A" })).toBeInTheDocument();
    expect(screen.getByRole("treegrid")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Margen neto" })).toBeInTheDocument();
  });

  it("recalculate the summary after each change", () => {
    const { store } = renderPage(ratesBasis);
    const margin = () => screen.getByRole("region", { name: "Margen neto" }).textContent;
    const before = margin();
    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });
    });
    expect(margin()).not.toBe(before);
  });

  it("show no money without rate access", () => {
    const { container } = renderPage(hoursBasis);
    expect(screen.getByRole("region", { name: "Equipo y horas" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("€");
  });
});
