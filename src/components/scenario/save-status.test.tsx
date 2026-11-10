import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import { SAVE_DELAY_MS, type SaveOutcome, type ScenarioStore } from "@/lib/scenarios/store";
import { renderWithIntl } from "@/test/render";
import { expectNoAxeViolations } from "@/test/axe";
import { StoreSpy } from "@/test/store-spy";

import { SaveStatus } from "./save-status";
import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  // Here, not in the tests: a failed assertion would leave the stubbed location to the next one.
  vi.unstubAllGlobals();
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

// Hidden too: while a window interrupts, the header behind it is hidden from screen readers.
const status = () => screen.getByRole("status", { hidden: true });
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
    expect(within(indicator()!).queryByRole("button", { hidden: true })).not.toBeInTheDocument();
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

  describe("when saving stops", () => {
    const dialog = () => screen.getByRole("alertdialog");

    it("interrupts on a conflict, with only a reload, which Escape does not skip", async () => {
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { change, answer } = renderStatus();
      await change();
      await answer({ ok: false, reason: "conflict", version: 5 });

      expect(dialog()).toHaveAccessibleName("El escenario se ha guardado en otro sitio");
      expect(dialog()).toHaveAccessibleDescription(
        "Ha cambiado en otra pestaña. Recarga para ver la última versión; los cambios de esta pestaña que no se guardaron se pierden.",
      );
      const buttons = within(dialog()).getAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual(["Recargar"]);
      expect(buttons[0]).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(dialog()).toBeInTheDocument();
      await user.click(buttons[0]!);
      expect(reload).toHaveBeenCalledOnce();
    });

    it("says a deleted copy is gone, with the way home and to a new demo", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { change, answer } = renderStatus();
      await change();
      await answer({ ok: false, reason: "not-found" });

      expect(dialog()).toHaveAccessibleName("Tu copia ya no existe");
      expect(dialog()).toHaveAccessibleDescription(
        "Las copias de la demo se borran tras 30 días sin usarse. Puedes empezar otra desde los datos de ejemplo.",
      );
      const links = within(dialog()).getAllByRole("link");
      expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
        ["Ir al inicio", "/home"],
        ["Abrir la demo", expect.stringMatching(/^\/scenarios\/.+/)],
      ]);
      expect(links[1]).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(dialog()).toBeInTheDocument();
    });

    it("lets the person go on without saving once the day's copies ran out", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { change, answer } = renderStatus();
      await change();
      await answer({ ok: false, reason: "limit" });

      expect(dialog()).toHaveAccessibleName("Hoy no se pueden guardar más copias de la demo");
      expect(dialog()).toHaveAccessibleDescription(
        "Hoy no se pueden crear más copias de la demo. Vuelve a intentarlo mañana. Puedes seguir mirando la demo sin guardar.",
      );
      await expectNoAxeViolations();

      await user.click(within(dialog()).getByRole("button", { name: "Seguir sin guardar" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      // The header still says why nothing is saved.
      expect(status()).toHaveTextContent("Hoy no se pueden guardar más copias de la demo");
    });

    it("lets Escape close the limit's window, which does not come back", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { change, answer } = renderStatus();
      await change();
      // Where the person was when it interrupted: the focus goes back there.
      act(() => indicator()!.focus());
      await answer({ ok: false, reason: "limit" });

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(indicator()).toHaveFocus();
      await change();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it.each([
      ["failed", { ok: false, reason: "failed" }],
      ["refused", { ok: false, reason: "invalid" }],
    ] as const)("does not interrupt when the save %s", async (_, outcome) => {
      const { change, answer } = renderStatus();
      await change();
      await answer(outcome);

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
