import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { HistoryControls } from "./history-controls";
import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";

const never = () => new Promise<SaveOutcome>(() => {});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderControls({ apple = false } = {}) {
  vi.stubGlobal("navigator", {
    ...navigator,
    userAgent: apple ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" : "Mozilla/5.0 (X11; Linux)",
  });
  const stores: ScenarioStore[] = [];
  renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis: hoursBasis, team, version: 1 }}
        save={never}
      >
        <HistoryControls />
        <input aria-label="Nota" />
        <div
          role="combobox"
          aria-label="Buscar"
          aria-expanded="false"
          aria-controls="none"
          tabIndex={0}
        />
        <div role="dialog" aria-label="Mover">
          <button type="button">Mover</button>
        </div>
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
  return store;
}

const halve = { type: "edit", id: developer.id, set: { allocation: 50 } } as const;
const allocation = (store: ScenarioStore) =>
  store.getState().history.team.find((member) => member.id === developer.id)?.allocation;
const undoButton = () => screen.getByRole("button", { name: "Deshacer" });
const redoButton = () => screen.getByRole("button", { name: "Rehacer" });

describe("HistoryControls", () => {
  it("shows undo and redo unavailable while there is nothing to undo or redo", () => {
    renderControls();
    expect(screen.getByRole("group", { name: "Historial de cambios" })).toBeInTheDocument();
    expect(undoButton()).toHaveAttribute("aria-disabled", "true");
    expect(redoButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("undoes and redoes with the buttons, keeping the focus on them", async () => {
    const user = userEvent.setup();
    const store = renderControls();
    act(() => {
      store.getState().dispatch(halve);
    });
    expect(undoButton()).toHaveAttribute("aria-disabled", "false");

    await user.click(undoButton());
    expect(allocation(store)).toBe(100);
    expect(undoButton()).toHaveFocus();
    await user.click(undoButton());
    expect(allocation(store)).toBe(100);

    await user.click(redoButton());
    expect(allocation(store)).toBe(50);
  });

  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y outside a Mac", () => {
    const store = renderControls();
    act(() => {
      store.getState().dispatch(halve);
    });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(allocation(store)).toBe(100);
    fireEvent.keyDown(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(allocation(store)).toBe(50);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    expect(allocation(store)).toBe(50);
    expect(undoButton()).toHaveAttribute("title", "Deshacer (Ctrl+Z)");
  });

  it("uses ⌘ on a Mac", () => {
    const store = renderControls({ apple: true });
    act(() => {
      store.getState().dispatch(halve);
    });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(allocation(store)).toBe(50);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(allocation(store)).toBe(100);
    expect(undoButton()).toHaveAttribute("title", "Deshacer (⌘Z)");
    expect(undoButton()).toHaveAttribute("aria-keyshortcuts", "Meta+Z");
  });

  it("leaves Ctrl+Z to a text field, a dialog and a composing input method", () => {
    const store = renderControls();
    act(() => {
      store.getState().dispatch(halve);
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Nota" }), { key: "z", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Buscar" }), {
      key: "z",
      ctrlKey: true,
    });
    // A dialog's form would act on a team that changed under it.
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover" }), { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, isComposing: true });
    expect(allocation(store)).toBe(50);
  });
});
