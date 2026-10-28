import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { HistoryControls } from "@/components/scenario/history-controls";
import { ScenarioEditor, ScenarioStoreProvider } from "@/components/scenario/scenario-editor";
import { LiveScenarioTeam } from "@/components/scenario/scenario-live";
import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import type { Member } from "@/lib/scenarios/change";
import { PM, personId, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { RosterPerson } from "@/lib/scenarios/scenario-view";
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
  save = never,
  people = (all: RosterPerson[]) => all,
}: {
  query?: string;
  wide?: boolean;
  chosen?: boolean;
  members?: Member[];
  save?: () => Promise<SaveOutcome>;
  /** Changes the organization's people, as they are now. */
  people?: (all: RosterPerson[]) => RosterPerson[];
} = {}) {
  stubScreen({ wide });
  stubHistory(`/scenarios/plan${query}`);
  const stores: ScenarioStore[] = [];
  const basis = {
    ...hoursBasis,
    scenario: { ...hoursBasis.scenario, chosen },
    people: people(hoursBasis.people),
  };
  const page = (drawing: number) => (
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis, team: members, version: 1 }}
        save={save}
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
    ).toEqual(["Editar…", "Añadir a su cargo…", "Mover a…", "Quitar del equipo"]);

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
    await user.click(within(menu()).getByRole("menuitem", { name: "Añadir a su cargo…" }));
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
      expect.stringMatching(/^Person 2, Senior Developer, ocupación hoy: 0\s%$/),
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

  it("edits an assignment's fields in one change, and focuses it again", async () => {
    const { user, store } = renderTeam();
    node("Role 2").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Editar…" }));
    const dialog = screen.getByRole("dialog", { name: "Editar Role 2 (Person 1)" });
    const field = (name: string) => within(dialog).getByRole("textbox", { name });

    expect(field("Horas semanales")).toHaveValue("30");
    await user.clear(field("Rol en el proyecto"));
    await user.type(field("Rol en el proyecto"), "Architect");
    await user.clear(field("Dedicación (%)"));
    await user.type(field("Dedicación (%)"), "50");
    await user.clear(field("Horas semanales"));
    await user.type(field("Horas semanales"), "32,5");
    const entries = store.getState().history.entries.length;
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().history.entries).toHaveLength(entries + 1);
    expect(store.getState().history.entries.at(-1)?.change).toEqual({
      type: "edit",
      id: seatId(2),
      set: { projectRole: "Architect", allocation: 50, weeklyHours: 32.5 },
    });
    await waitFor(() => expect(node("Architect")).toHaveFocus());
  });

  it("offers the people of the role's category, and a person brings their hours", async () => {
    const { user, store } = renderTeam();
    node("Role 2").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Editar…" }));
    const dialog = screen.getByRole("dialog");
    const who = within(dialog).getByRole("combobox", { name: "Persona o vacante" });

    // Its own person, the other active Senior Developer; not the inactive one, nor the PM.
    expect(
      within(who)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Vacante (sin persona)",
      expect.stringMatching(/^Person 1, ocupación hoy: 0\s%$/),
      expect.stringMatching(/^Person 2, ocupación hoy: 0\s%$/),
    ]);
    const hours = within(dialog).getByRole("textbox", { name: "Horas semanales" });
    // Nobody, or the person it had, brings back the seat's 30 h; a new person, theirs.
    await user.selectOptions(who, personId(2));
    expect(hours).toHaveValue("37,5");
    await user.selectOptions(who, "");
    expect(hours).toHaveValue("30");
    await user.selectOptions(who, personId(2));
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(store.getState().history.team.find((member) => member.id === seatId(2))).toMatchObject({
      personId: personId(2),
      weeklyHours: 37.5,
    });
  });

  it("keeps offering the role's own person after they moved to another category", async () => {
    // Person 1, the lead's, is now a Project Manager.
    const { user } = renderTeam({
      people: (people) =>
        people.map((person) =>
          person.id === personId(1) ? { ...person, categoryId: PM } : person,
        ),
    });
    node("Role 2").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Editar…" }));
    const who = within(screen.getByRole("dialog")).getByRole("combobox", {
      name: "Persona o vacante",
    });

    expect(who).toHaveValue(personId(1));
    expect(within(who).getByRole("option", { selected: true })).toHaveTextContent(/^Person 1/);
  });

  it("names the date a problem is about, and takes the keyboard there", async () => {
    const { user } = renderTeam();
    node("Role 2").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Editar…" }));
    const dialog = screen.getByRole("dialog");
    const start = within(dialog).getByLabelText("Inicio");

    await user.clear(start);
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Escribe la fecha de inicio completa.",
    );
    expect(start).toHaveFocus();
    expect(start).toHaveAccessibleDescription("Escribe la fecha de inicio completa.");
  });

  it("ties each problem to its field, and saves nothing when nothing changed", async () => {
    const { user, store } = renderTeam();
    node("Role 2").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Editar…" }));
    const dialog = screen.getByRole("dialog");
    const allocation = within(dialog).getByRole("textbox", { name: "Dedicación (%)" });

    await user.clear(allocation);
    await user.type(allocation, "150");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "La dedicación es un número entero del 0 al 100.",
    );
    expect(allocation).toHaveAttribute("aria-invalid", "true");

    await user.clear(allocation);
    await user.type(allocation, "100");
    const entries = store.getState().history.entries.length;
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().history.entries).toHaveLength(entries);
    await waitFor(() => expect(node("Role 2")).toHaveFocus());
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

    // The form checks itself, in the page's language, and ties the problem to its field.
    await user.clear(role);
    await user.click(within(dialog).getByRole("button", { name: "Añadir" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Escribe el rol en el proyecto.");
    expect(role).toHaveAttribute("aria-invalid", "true");
    expect(role).toHaveAccessibleDescription("Escribe el rol en el proyecto.");
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
    ).toEqual(["Nadie (encabeza el equipo)", "Role 2 (Person 1)", "Role 3 (vacante)"]);

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

  it("follows the selection and the focus to the copy's ids after the first save", async () => {
    const copyOf = (id: string) => id.replace("-8000-", "-9000-");
    const ids = [...team.map((member) => member.id), seatId(99)];
    const save = () =>
      Promise.resolve<SaveOutcome>({
        ok: true,
        version: 2,
        scenarioId: copyOf(seatId(99)),
        renamed: Object.fromEntries(ids.map((id) => [id, copyOf(id)])),
      });
    const { user, redraw, store } = renderTeam({ save });
    node("Role 4").focus();
    await user.keyboard("{Enter}");
    await user.click(within(menu()).getByRole("menuitem", { name: "Quitar del equipo" }));

    await waitFor(() => expect(store.getState().scenarioId).toBe(copyOf(seatId(99))), {
      timeout: 2_000,
    });
    redraw();

    await waitFor(() => expect(node("Role 1")).toHaveFocus());
    expect(node("Role 1")).toHaveAttribute("data-assignment", copyOf(seatId(1)));
    expect(node("Role 1")).toHaveAttribute("aria-current", "true");
  });

  it("leaves focus where a click outside an open menu puts it", async () => {
    const { user } = renderTeam();
    node("Role 2").focus();
    await user.keyboard("{Enter}");

    // What a click does, short of the mouse events d3's zoom cannot take in jsdom.
    const other = node("Role 3");
    fireEvent.pointerDown(other);
    other.focus();
    fireEvent.click(other);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    expect(node("Role 3")).toHaveFocus();
  });

  it("gives focus back to the cell a row's menu was opened from", async () => {
    const { user } = renderTeam({ query: "?view=table" });
    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.dataset.row === seatId(2))!;
    const cell = within(row).getAllByRole("gridcell")[2]!;
    cell.focus();

    await user.keyboard("{Enter}");
    expect(menu()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(cell).toHaveFocus();
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
    // A team without assignments starts with the next full month (docs/domain.md, "Changes").
    expect(dialog).toHaveAccessibleDescription(/durante el mes que viene/);
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

    const narrow = renderTeam({ query: "?view=table", wide: false });
    expect(screen.queryByRole("button", { name: "Añadir al equipo…" })).not.toBeInTheDocument();
    narrow.unmount();

    renderTeam({ members: [], wide: false });
    expect(screen.getByText("Sus asignaciones aparecerán aquí.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir al equipo…" })).not.toBeInTheDocument();
  });
});
