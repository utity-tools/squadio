import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type {
  RevisionRequest,
  SaveOutcome,
  SaveRequest,
  ScenarioStore,
} from "@/lib/scenarios/store";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";
import { ScenarioRevision } from "./save-revision";

// docs/domain.md, "When one is made": «Guardar revisión» saves a revision of the scenario as the
// page shows it, with rate access only, and says which one it was.

type Send = (request: RevisionRequest) => Promise<unknown>;

const revision = (number: number, reused = false) => ({
  ok: true,
  version: 3,
  scenarioId: seatId(99),
  revision: { id: seatId(900 + number), number },
  reused,
});

function renderInEditor(
  basis: ScenarioBasis,
  send: Send = vi.fn(async () => revision(1)),
  {
    locale = "es",
    save = () => new Promise<SaveOutcome>(() => {}),
  }: { locale?: "es" | "en"; save?: (request: SaveRequest) => Promise<SaveOutcome> } = {},
) {
  const stores: ScenarioStore[] = [];
  renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor scenarioId={seatId(99)} editing={{ basis, team, version: 3 }} save={save}>
        <ScenarioRevision send={send} />
        <StoreSpy onStore={(store) => void stores.push(store)} />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
    { locale },
  );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { store, send };
}

describe("ScenarioRevision", () => {
  it("saves a revision of the page's scenario and says its number", async () => {
    const { send } = renderInEditor(ratesBasis);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar revisión" }));
    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), baseVersion: 3 });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Revisión 1 guardada"),
    );
  });

  it("says which revision is used again when nothing changed", async () => {
    renderInEditor(ratesBasis, async () => revision(4, true), { locale: "en" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("No changes: revision 4 is used"),
    );
  });

  it("says the store's last answer, as the copy's page does after a first revision moved there", async () => {
    const { store } = renderInEditor(ratesBasis);
    act(() => {
      store.setState({ revisionNote: { answer: { ok: true, number: 1, reused: false }, seq: 1 } });
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Revisión 1 guardada"),
    );
  });

  it("says nothing more once the team changes", async () => {
    const { store } = renderInEditor(ratesBasis);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar revisión" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Revisión 1 guardada"),
    );
    const [first] = team;
    if (!first) throw new Error("expected a team");
    act(() => {
      store.getState().dispatch({ type: "remove", id: first.id });
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("is not offered without rate access: a revision holds the scenario's money", () => {
    renderInEditor(hoursBasis);
    expect(screen.queryByRole("button", { name: "Guardar revisión" })).not.toBeInTheDocument();
  });

  it("is busy while the revision is on its way, and sends it once", async () => {
    let answer: (outcome: unknown) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          answer = resolve;
        }),
    );
    renderInEditor(ratesBasis, send);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Guardar revisión" }));
    const button = screen.getByRole("button", { name: "Guardando revisión…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => answer(revision(2)));
    expect(screen.getByRole("button", { name: "Guardar revisión" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Revisión 2 guardada"),
    );
  });

  it("saves the changes left first", async () => {
    const save = vi.fn(async () => ({ ok: true as const, version: 4, scenarioId: seatId(99) }));
    const send = vi.fn(async () => ({ ...revision(2), version: 4 }));
    const { store } = renderInEditor(ratesBasis, send, { save });
    const [first] = team;
    if (!first) throw new Error("expected a team");
    act(() => {
      store.getState().dispatch({ type: "remove", id: first.id });
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar revisión" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), baseVersion: 4 });
  });

  it.each([
    ["no-rate-access", "Guardar una revisión copia costes, y necesita acceso a tarifas."],
    ["conflict", "El escenario ha cambiado en otra pestaña. Recarga la página."],
    ["not-found", "Este escenario ya no existe. Recarga la página."],
    ["limit", "Hoy no se pueden crear más copias de la demo. Vuelve a intentarlo mañana."],
    ["invalid", "No se ha podido guardar la revisión. Inténtalo de nuevo."],
  ])("says why it was refused: %s", async (reason, message) => {
    renderInEditor(ratesBasis, async () => ({ ok: false, reason }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar revisión" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("says the revision waits when the changes could not be saved", async () => {
    const send = vi.fn();
    const { store } = renderInEditor(ratesBasis, send, {
      save: async () => ({ ok: false, reason: "failed" }),
    });
    const [first] = team;
    if (!first) throw new Error("expected a team");
    act(() => {
      store.getState().dispatch({ type: "remove", id: first.id });
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar revisión" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se han podido guardar los cambios, así que la revisión tampoco.",
    );
  });

  it("has no axe violations", async () => {
    renderInEditor(ratesBasis);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar revisión" }));
    await expectNoAxeViolations();
  });
});
