import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { PM, SENIOR, developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { ChoiceRequest, SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { ScenarioChoice } from "./scenario-choice";
import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";

// docs/domain.md, "Choosing a scenario": the header's choice, with rate access only, confirmed in
// a dialog that says what choosing freezes and replaces.

const never = () => new Promise<SaveOutcome>(() => {});

type Send = (request: ChoiceRequest) => Promise<unknown>;

const answered: Send = async (request) => ({
  ok: true,
  version: request.baseVersion + 1,
  scenarioId: request.scenarioId,
});

function renderChoice({
  basis = ratesBasis,
  send = vi.fn(answered),
}: { basis?: ScenarioBasis; send?: Send } = {}) {
  const stores: ScenarioStore[] = [];
  renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor scenarioId={seatId(99)} editing={{ basis, team, version: 3 }} save={never}>
        <ScenarioChoice scenarioId={seatId(99)} send={send} />
        <StoreSpy onStore={(store) => void stores.push(store)} />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
  );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { store, send, user: userEvent.setup() };
}

const chosen = (basis: ScenarioBasis): ScenarioBasis => ({
  ...basis,
  scenario: { ...basis.scenario, chosen: true },
});

/** The basis with no rate for `categoryIds`. */
const withoutRates = (categoryIds: string[]): ScenarioBasis =>
  ratesBasis.engine.rateAccess
    ? {
        ...ratesBasis,
        engine: {
          ...ratesBasis.engine,
          input: {
            ...ratesBasis.engine.input,
            rates: ratesBasis.engine.input.rates.filter(
              (rate) => !categoryIds.includes(rate.categoryId),
            ),
          },
        },
      }
    : ratesBasis;

const chooseButton = () => screen.getByRole("button", { name: "Elegir escenario" });

describe("ScenarioChoice", () => {
  it("offers nothing without rate access", () => {
    renderChoice({ basis: hoursBasis });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("chooses the scenario once confirmed, with the version the page shows", async () => {
    const { store, send, user } = renderChoice();
    await user.click(chooseButton());
    const dialog = screen.getByRole("dialog", { name: "¿Elegir «Plan A»?" });
    expect(dialog).toHaveAccessibleDescription(
      "Se congelan las tarifas de sus categorías, el overhead, el buffer y la disponibilidad de hoy; el precio, los costes extra y el margen objetivo no. Su equipo deja de poder editarse hasta que quites la elección.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Elegir escenario" }));

    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), baseVersion: 3, chosen: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().basis.scenario.chosen).toBe(true);
    // The focus goes back to the button, whose name now says what it does next, and a status
    // says the choice was made.
    expect(screen.getByRole("button", { name: "Quitar la elección" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Se ha elegido «Plan A».");
  });

  it("gives the focus back on the copy's page after the first choice moved there", async () => {
    let move = () => {};
    function Pages() {
      const [copy, setCopy] = useState(false);
      move = () => setCopy(true);
      // The section keeps the provider; the page under it is a new one at the copy's id.
      return copy ? (
        <ScenarioEditor
          key="copy"
          scenarioId={seatId(98)}
          editing={{ basis: chosen(ratesBasis), team, version: 2 }}
          save={never}
        >
          <ScenarioChoice scenarioId={seatId(98)} send={answered} />
        </ScenarioEditor>
      ) : (
        <ScenarioEditor
          key="template"
          scenarioId={seatId(99)}
          editing={{ basis: ratesBasis, team, version: 1 }}
          save={never}
        >
          <ScenarioChoice
            scenarioId={seatId(99)}
            send={async () => {
              // As the action answers, with the copy's ids, the page moves to the copy.
              setTimeout(move);
              return {
                ok: true,
                version: 2,
                scenarioId: seatId(98),
                renamed: { [seatId(99)]: seatId(98) },
              };
            }}
          />
        </ScenarioEditor>
      );
    }
    const user = userEvent.setup();
    renderWithIntl(
      <ScenarioStoreProvider>
        <Pages />
      </ScenarioStoreProvider>,
    );
    await user.click(chooseButton());
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Elegir escenario" }),
    );
    expect(screen.getByRole("button", { name: "Quitar la elección" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Se ha elegido «Plan A».");
  });

  it("says which scenario stops being the project's chosen one", async () => {
    const { user } = renderChoice({
      basis: { ...ratesBasis, scenario: { ...ratesBasis.scenario, otherChosen: "Plan B" } },
    });
    await user.click(chooseButton());
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "«Plan B» dejará de ser el escenario elegido del proyecto: se descartan sus valores congelados y su equipo se podrá editar de nuevo.",
    );
  });

  it("unchooses a chosen scenario once confirmed", async () => {
    const { store, send, user } = renderChoice({ basis: chosen(ratesBasis) });
    await user.click(screen.getByRole("button", { name: "Quitar la elección" }));
    const dialog = screen.getByRole("dialog", { name: "¿Quitar la elección de «Plan A»?" });
    await user.click(within(dialog).getByRole("button", { name: "Quitar la elección" }));
    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), baseVersion: 3, chosen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The page loads its basis with the current values, and only then is it unchosen.
    act(() => store.getState().adopt(ratesBasis));
    expect(chooseButton()).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Se ha quitado la elección de «Plan A».");
  });

  it("changes nothing when cancelled", async () => {
    const { send, user } = renderChoice();
    await user.click(chooseButton());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(chooseButton()).toHaveFocus();
  });

  it("explains that a category without a rate cannot be chosen, offering no confirmation", async () => {
    const { send, user } = renderChoice({ basis: withoutRates([PM]) });
    await user.click(chooseButton());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(
      "No se puede elegir: falta la tarifa de Project Manager, y no hay nada que congelar.",
    );
    expect(within(dialog).queryByRole("button", { name: "Elegir escenario" })).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("names every category without a rate", async () => {
    const { user } = renderChoice({ basis: withoutRates([PM, SENIOR]) });
    await user.click(chooseButton());
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "No se puede elegir: faltan las tarifas de Senior Developer y Project Manager, y no hay nada que congelar.",
    );
  });

  it("waits for the changes to be saved before choosing", async () => {
    const { store, send, user } = renderChoice();
    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });
    });
    await user.click(chooseButton());
    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Elegir escenario",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAccessibleDescription(
      "Los cambios aún no se han guardado: podrás continuar en cuanto se guarden.",
    );
    await user.click(confirm);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    [
      "failed",
      "No se han podido guardar los cambios: reinténtalo desde la cabecera para continuar.",
    ],
    ["conflict", "Esta página ya no puede guardar cambios: recárgala para continuar."],
    ["limit", "Hoy no se pueden crear más copias de la demo. Vuelve a intentarlo mañana."],
  ] as const)("says what to do when saving stopped (%s)", async (saveStatus, message) => {
    const { store, user } = renderChoice();
    act(() => store.setState({ saveStatus }));
    await user.click(chooseButton());
    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Elegir escenario",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAccessibleDescription(message);
  });

  it.each([
    ["missing-rate", "No se puede elegir: a una categoría del equipo le falta la tarifa."],
    ["limit", "Hoy no se pueden crear más copias de la demo. Vuelve a intentarlo mañana."],
    ["conflict", "El escenario ha cambiado en otra pestaña. Recarga la página."],
    ["failed", "No se ha podido guardar la elección. Vuelve a intentarlo."],
    ["no-change", "El escenario ha cambiado en otra pestaña. Recarga la página."],
  ])("says why the server refused (%s), keeping the dialog open", async (reason, message) => {
    const { user } = renderChoice({ send: async () => ({ ok: false, reason }) });
    await user.click(chooseButton());
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Elegir escenario" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(message);
  });

  it("shows the choice on its way and refuses a second click", async () => {
    let answer: (outcome: unknown) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          answer = resolve;
        }),
    );
    const { user } = renderChoice({ send });
    await user.click(chooseButton());
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Elegir escenario" }));
    const busy = within(dialog).getByRole("button", { name: "Eligiendo…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(busy);
    await user.keyboard("{Escape}");
    expect(send).toHaveBeenCalledTimes(1);
    expect(dialog).toBeInTheDocument();
    await act(async () => answer({ ok: true, version: 4, scenarioId: seatId(99) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
