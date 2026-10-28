import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { HistoryControls } from "@/components/scenario/history-controls";
import { ScenarioEditor, ScenarioStoreProvider } from "@/components/scenario/scenario-editor";
import { LiveScenarioTeam } from "@/components/scenario/scenario-live";
import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import type { Member } from "@/lib/scenarios/change";
import { personId, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import es from "../../../messages/es.json";

vi.mock("next/navigation", () => import("@/test/navigation"));

stubReactFlowLayout();

const never = () => new Promise<SaveOutcome>(() => {});

// The team of change.fixtures.ts: the manager (Role 1, Person 3) has the lead (Role 2, Person 1)
// and the designer (Role 4, an open role) under them; the developer (Role 3) reports to the lead
// and the tester (Role 5) to the designer.

/** The team as the page draws it; `drawing` changes its key, so it is drawn anew. */
function Team({ drawing }: { drawing: number }) {
  return <LiveScenarioTeam key={drawing} />;
}

function renderTeam({
  query = "?view=tree",
  wide = true,
  chosen = false,
  members = team,
}: { query?: string; wide?: boolean; chosen?: boolean; members?: Member[] } = {}) {
  stubScreen({ wide });
  stubHistory(`/scenarios/plan${query}`);
  const stores: ScenarioStore[] = [];
  const basis = { ...hoursBasis, scenario: { ...hoursBasis.scenario, chosen } };
  const page = (drawing: number) => (
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis, team: members, version: 1 }}
        save={never}
      >
        <HistoryControls />
        <Team drawing={drawing} />
        <StoreSpy onStore={(store) => void stores.push(store)} />
      </ScenarioEditor>
    </ScenarioStoreProvider>
  );
  const view = renderWithIntl(page(0));
  /** Draws the team anew, as the page does when it moves to the copy after the first save. */
  const redraw = () =>
    view.rerender(
      <NextIntlClientProvider locale="es" messages={es} timeZone="Europe/Madrid">
        {page(1)}
      </NextIntlClientProvider>,
    );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { ...view, store, redraw, user: userEvent.setup() };
}

const node = (role: string) => screen.getByRole("button", { name: new RegExp(`^${role},`) });
const nodeIds = (store: ScenarioStore) => store.getState().history.team.map((member) => member.id);
const menu = () => screen.getByRole("menu");

describe("the team's menus", () => {
  it("opens a node's actions with Enter, and gives focus back to it on Escape", async () => {
    const { user } = renderTeam();
    node("Role 2").focus();

    await user.keyboard("{Enter}");
    expect(menu()).toHaveAccessibleName("Acciones de Role 2 (Person 1)");
    expect(
      within(menu())
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Añadir debajo…", "Mover a…", "Quitar del equipo"]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(node("Role 2")).toHaveFocus();
  });

  it("removes an assignment and moves focus to its manager", async () => {
    const { user, store } = renderTeam();
    node("Role 2").focus();

    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Quitar del equipo" }));

    expect(nodeIds(store)).not.toContain(seatId(2));
    await waitFor(() => expect(node("Role 1")).toHaveFocus());
    // Its report moved up to the manager.
    expect(store.getState().history.team.find((member) => member.id === seatId(3))?.reportsTo).toBe(
      seatId(1),
    );
  });

  it("adds a person below a node, named after their category, and focuses the new node", async () => {
    const { user, store } = renderTeam();
    node("Role 4").focus();

    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Añadir debajo…" }));
    const dialog = screen.getByRole("dialog", { name: "Añadir al equipo" });
    expect(dialog).toHaveAccessibleDescription(/Dependerá de Role 4 \(vacante\)/);
    const who = within(dialog).getByRole("combobox", { name: "Persona o vacante" });
    // People already on the team, and inactive ones, are not offered.
    expect(
      within(who)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Elige una persona o una vacante",
      "Vacante de Senior Developer",
      "Vacante de Project Manager",
      expect.stringMatching(/^Person 2 · ocupación hoy 0\s%$/),
    ]);

    await user.selectOptions(who, `person:${personId(2)}`);
    expect(within(dialog).getByRole("textbox", { name: "Rol en el proyecto" })).toHaveValue(
      "Senior Developer",
    );
    await user.click(within(dialog).getByRole("button", { name: "Añadir" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const added = store.getState().history.team.find((member) => member.personId === personId(2));
    expect(added).toMatchObject({
      projectRole: "Senior Developer",
      reportsTo: seatId(4),
      allocation: 100,
      weeklyHours: 37.5,
    });
    await waitFor(() => expect(node("Senior Developer")).toHaveFocus());
  });

  it("keeps a typed project role when the choice changes", async () => {
    const { user } = renderTeam();
    await user.click(screen.getByRole("button", { name: "Añadir al equipo…" }));
    const dialog = screen.getByRole("dialog", { name: "Añadir al equipo" });
    expect(dialog).toHaveAccessibleDescription(/No dependerá de nadie/);
    const role = within(dialog).getByRole("textbox", { name: "Rol en el proyecto" });

    await user.type(role, "QA");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Persona o vacante" }),
      "Vacante de Project Manager",
    );
    expect(role).toHaveValue("QA");
  });

  it("gives focus back to the node when a dialog is cancelled", async () => {
    const { user } = renderTeam();
    node("Role 3").focus();

    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Mover a…" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(node("Role 3")).toHaveFocus());
  });

  it("moves an assignment only where the change model accepts it, and focuses it", async () => {
    const { user, store } = renderTeam();
    node("Role 4").focus();

    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Mover a…" }));
    const dialog = screen.getByRole("dialog", { name: "Mover Role 4 (vacante)" });
    const reportsTo = within(dialog).getByRole("combobox", { name: "Depende de" });
    // Not itself, not the tester below it, not the manager it reports to already.
    expect(
      within(reportsTo)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Nadie: arriba del todo", "Role 2 (Person 1)", "Role 3 (vacante)"]);

    await user.selectOptions(reportsTo, "Role 2 (Person 1)");
    await user.click(within(dialog).getByRole("button", { name: "Mover" }));

    expect(store.getState().history.team.find((member) => member.id === seatId(4))?.reportsTo).toBe(
      seatId(2),
    );
    await waitFor(() => expect(node("Role 4")).toHaveFocus());
  });

  it("selects what an undo from the header touched, leaving focus on the button", async () => {
    const { user, store } = renderTeam();
    act(() => void store.getState().dispatch({ type: "remove", id: seatId(5) }));
    const undo = screen.getByRole("button", { name: /Deshacer/ });

    await user.click(undo);

    expect(nodeIds(store)).toContain(seatId(5));
    expect(undo).toHaveFocus();
    expect(node("Role 5")).toHaveAttribute("aria-current", "true");
  });

  it("keeps the selection and the focus when the page draws the team anew", async () => {
    const { user, redraw, store } = renderTeam();
    node("Role 4").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Quitar del equipo" }));
    await waitFor(() => expect(node("Role 1")).toHaveFocus());

    redraw();

    expect(nodeIds(store)).not.toContain(seatId(4));
    await waitFor(() => expect(node("Role 1")).toHaveFocus());
    expect(node("Role 1")).toHaveAttribute("aria-current", "true");
  });

  it("opens a row's actions with Enter in the table", async () => {
    const { user } = renderTeam({ query: "?view=table" });
    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.dataset.row === seatId(2))!;
    row.focus();

    await user.keyboard("{Enter}");
    expect(menu()).toHaveAccessibleName("Acciones de Role 2 (Person 1)");
    await user.keyboard("{Escape}");
    expect(row).toHaveFocus();
  });

  it("starts an empty team, and goes back to its button when the last assignment leaves", async () => {
    const { user, store } = renderTeam({ members: [] });
    await user.click(screen.getByRole("button", { name: "Añadir al equipo…" }));
    const dialog = screen.getByRole("dialog", { name: "Añadir al equipo" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Persona o vacante" }),
      "Vacante de Project Manager",
    );
    await user.click(within(dialog).getByRole("button", { name: "Añadir" }));
    await waitFor(() => expect(node("Project Manager")).toHaveFocus());

    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Quitar del equipo" }));

    expect(store.getState().history.team).toEqual([]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Añadir al equipo…" })).toHaveFocus(),
    );
  });

  it("offers nothing on a chosen scenario's team or on a narrow screen", async () => {
    const chosen = renderTeam({ chosen: true });
    node("Role 2").focus();
    await chosen.user.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir al equipo…" })).not.toBeInTheDocument();
    chosen.unmount();

    renderTeam({ query: "?view=table", wide: false });
    expect(screen.queryByRole("button", { name: "Añadir al equipo…" })).not.toBeInTheDocument();
  });
});
