import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildRevision } from "@/lib/revisions/build-revision";
import { revisionSourceOf } from "@/lib/revisions/revision-source";
import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";
import { ScenarioBarName, ScenarioCard } from "./scenario-card";
import { LiveScenarioSummary, LiveScenarioTeam } from "./scenario-live";

vi.mock("next/navigation", () => import("@/test/navigation"));

stubReactFlowLayout();

beforeEach(() => {
  stubScreen({ wide: false });
  stubHistory("/scenarios/plan?view=table");
});

const never = () => new Promise<SaveOutcome>(() => {});

function renderPage(basis: ScenarioBasis, { readOnly = false } = {}) {
  const stores: ScenarioStore[] = [];
  const view = renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis, team, version: 1 }}
        save={never}
        readOnly={readOnly}
      >
        <ScenarioBarName />
        <ScenarioCard alternative={false} result={<LiveScenarioSummary />} history={null} />
        <LiveScenarioTeam />
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
  it("draw the bar's name, the card, the team and the summary from the store", () => {
    renderPage(ratesBasis);
    // One h1, the bar's: the card's panel can be hidden.
    expect(screen.getByRole("heading", { level: 1, name: "Plan A" })).toHaveClass("truncate");
    expect(screen.getByRole("group", { name: "Plan A" })).toBeInTheDocument();
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

  describe("on a chosen scenario", () => {
    const chosen = (basis: ScenarioBasis): ScenarioBasis => ({
      ...basis,
      scenario: { ...basis.scenario, chosen: true },
    });

    // docs/domain.md, "Choosing a revision": its page shows the revision it points at.
    const revision = buildRevision(revisionSourceOf(ratesBasis, team));
    const withRevision = (basis: ScenarioBasis): ScenarioBasis => ({
      ...chosen(basis),
      chosenRevision: {
        id: "revision-1",
        number: 1,
        view: basis.engine.rateAccess
          ? { ...revision, targetMarginBasisPoints: 2_500, smallCategories: [] }
          : { open: revision.open, restricted: null },
      },
    });

    it.each([
      ["with rate access", ratesBasis],
      ["without rate access", hoursBasis],
    ])("say its team is locked and shows the chosen revision %s", (_, basis) => {
      renderPage(withRevision(basis));
      expect(screen.getByText("Equipo bloqueado · muestra la revisión elegida")).toBeVisible();
    });
  });

  // ADR 0015: a viewer reads the team and edits nothing, even on a wide screen.
  describe("for a viewer", () => {
    beforeEach(() => {
      stubScreen({ wide: true });
    });

    it("lets an editor add to the team on a wide screen", () => {
      renderPage(hoursBasis);
      expect(screen.getByRole("button", { name: "Añadir al equipo…" })).toBeVisible();
    });

    it("lock the team, say why, and offer nothing to change it", () => {
      renderPage(hoursBasis, { readOnly: true });
      expect(screen.getByText("Solo lectura · tu rol es de lector")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Añadir al equipo…" })).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Equipo y horas" })).toBeInTheDocument();
    });

    it("say it is read only on a chosen scenario too", () => {
      renderPage(
        { ...hoursBasis, scenario: { ...hoursBasis.scenario, chosen: true } },
        { readOnly: true },
      );
      expect(screen.getByText("Solo lectura · tu rol es de lector")).toBeVisible();
    });
  });
});
