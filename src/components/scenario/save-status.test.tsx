import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import { SAVE_DELAY_MS, type SaveOutcome, type ScenarioStore } from "@/lib/scenarios/store";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { SaveStatus } from "./save-status";
import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A fake Server Action: each save waits for the test's answer. */
function renderStatus() {
  const answers: ((outcome: SaveOutcome) => void)[] = [];
  const save = () =>
    new Promise<SaveOutcome>((resolve) => {
      answers.push(resolve);
    });
  const stores: ScenarioStore[] = [];
  renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis: hoursBasis, team, version: 1 }}
        save={save}
      >
        <SaveStatus />
        <StoreSpy
          onStore={(store) => {
            stores.push(store);
          }}
        />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
  );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  const answer = async (outcome: SaveOutcome) => {
    await act(async () => {
      answers.shift()?.(outcome);
      await vi.advanceTimersByTimeAsync(0);
    });
  };
  const change = async () => {
    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(SAVE_DELAY_MS));
  };
  return { store, answer, change, answers };
}

const status = () => screen.getByRole("status");
/** The whole indicator, as seen: the status region and the quiet progress beside it. */
const indicator = () => status().parentElement;

describe("SaveStatus", () => {
  it("says nothing before the first change, in a status region already there", () => {
    renderStatus();
    expect(status()).toBeEmptyDOMElement();
  });

  it("shows saving, then saved, without announcing them", async () => {
    const { change, answer } = renderStatus();
    await change();
    expect(indicator()).toHaveTextContent("Guardando…");
    expect(status()).toBeEmptyDOMElement();
    await answer({ ok: true, version: 2, scenarioId: seatId(99) });
    expect(indicator()).toHaveTextContent("Guardado");
    expect(status()).toBeEmptyDOMElement();
  });

  it("offers a retry after a failed save", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { change, answer, answers } = renderStatus();
    await change();
    await answer({ ok: false, reason: "failed" });
    expect(status()).toHaveTextContent("No se ha podido guardar");

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(answers).toHaveLength(1);
    expect(indicator()).toHaveTextContent("Guardando…");
    // The button is gone: the focus stays on the indicator, not lost to the page.
    expect(indicator()).toHaveFocus();
  });

  it("offers a reload when the scenario changed in another tab", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { change, answer } = renderStatus();
    await change();
    await answer({ ok: false, reason: "conflict", version: 5 });
    expect(status()).toHaveTextContent("El escenario se ha guardado en otro sitio");

    await user.click(screen.getByRole("button", { name: "Recargar" }));
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("stops warning before closing once saving has stopped", async () => {
    const { change, answer } = renderStatus();
    await change();
    await answer({ ok: false, reason: "gone" });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("says when the day's copies ran out, with nothing to try", async () => {
    const { change, answer } = renderStatus();
    await change();
    await answer({ ok: false, reason: "limit" });
    expect(status()).toHaveTextContent("Hoy no se pueden guardar más copias de la demo");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks the browser to warn before closing while a change is not saved", async () => {
    const { change, answer } = renderStatus();
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    await change();
    expect(leave()).toBe(true);
    await answer({ ok: true, version: 2, scenarioId: seatId(99) });
    expect(leave()).toBe(false);
  });
});
