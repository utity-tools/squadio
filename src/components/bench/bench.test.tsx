import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ScenarioEditor, ScenarioStoreProvider } from "@/components/scenario/scenario-editor";
import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import { developer, personId, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { Bench } from "./bench";

const never = () => new Promise<SaveOutcome>(() => {});

const BUSY: Record<string, number> = { [personId(1)]: 130, [personId(3)]: 50 };

/** People 1 to 3 are active, 4 is not; 1 and 3 are on the team, and 1 is over-allocated. */
const basis: ScenarioBasis = {
  ...hoursBasis,
  people: hoursBasis.people.map((person) => ({ ...person, occupancy: BUSY[person.id] ?? 0 })),
};

function renderBench(people = basis.people) {
  const stores: ScenarioStore[] = [];
  const view = renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis: { ...basis, people }, team, version: 1 }}
        save={never}
      >
        <Bench />
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
  return { ...view, store };
}

const card = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
/** The people listed, without the open roles. */
const names = () =>
  screen
    .queryAllByRole("listitem")
    .filter((item) => item.hasAttribute("data-bench-person"))
    .map((item) => within(item).getAllByText(/^Person/)[0]?.textContent);
const openRoles = () =>
  screen
    .queryAllByRole("listitem")
    .filter((item) => item.hasAttribute("data-bench-open-role"))
    .map((item) => item.closest("div")?.querySelector("h3 span")?.textContent);

describe("Bench", () => {
  it("lists the active people by category, with how many", () => {
    renderBench();
    expect(screen.getByRole("heading", { level: 2, name: "Banquillo" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /^Senior Developer\s*2 personas$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /^Project Manager\s*1 persona$/ }),
    ).toBeInTheDocument();
    expect(names()).toEqual(["Person 1", "Person 2", "Person 3"]);
    expect(screen.queryByText("Person 4")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 personas");
  });

  it("is not a set of landmarks", () => {
    renderBench();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });

  it("says when the organization has nobody active, and still offers open roles", () => {
    renderBench(basis.people.map((person) => ({ ...person, active: false })));
    expect(screen.getByText("Todavía no hay personas activas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar filtros" })).not.toBeInTheDocument();
    expect(openRoles()).toEqual(["Senior Developer", "Project Manager"]);
  });

  it("offers an open role first in each category, with Config's weekly hours", () => {
    renderBench();
    const [first] = screen.getAllByRole("listitem");
    expect(first).toHaveAttribute("data-bench-open-role");
    expect(first).toHaveTextContent("Vacante");
    expect(first).toHaveTextContent("40 h/semana");
    expect(openRoles()).toEqual(["Senior Developer", "Project Manager"]);
  });

  it("hides the open roles while searching names, but keeps them for a category", async () => {
    const user = userEvent.setup();
    renderBench();

    await user.type(screen.getByRole("searchbox", { name: "Buscar persona" }), "son 2");
    expect(openRoles()).toEqual([]);

    await user.clear(screen.getByRole("searchbox", { name: "Buscar persona" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Categoría" }),
      "Project Manager",
    );
    expect(openRoles()).toEqual(["Project Manager"]);
  });

  it("says how busy each person is today, and when they are over-allocated", () => {
    renderBench();
    expect(card("Person 1")).toHaveTextContent("Ocupación hoy: 130 %");
    expect(within(card("Person 1")).getByText("Sobreasignación")).toBeInTheDocument();
    expect(card("Person 3")).toHaveTextContent("Ocupación hoy: 50 %");
    expect(within(card("Person 3")).queryByText("Sobreasignación")).not.toBeInTheDocument();
    expect(card("Person 2")).toHaveTextContent("37,5 h/semana");
  });

  it("marks who is on the team, following each change", () => {
    const { store } = renderBench();
    expect(within(card("Person 1")).getByText("En el equipo")).toBeInTheDocument();
    expect(within(card("Person 2")).queryByText("En el equipo")).not.toBeInTheDocument();

    act(() => {
      store.getState().dispatch({ type: "edit", id: developer.id, set: { personId: personId(2) } });
    });
    expect(within(card("Person 2")).getByText("En el equipo")).toBeInTheDocument();
  });

  it("filters by name and by category, and says how many are left", async () => {
    const user = userEvent.setup();
    renderBench();

    await user.type(screen.getByRole("searchbox", { name: "Buscar persona" }), "son 2");
    expect(names()).toEqual(["Person 2"]);
    // A screen reader hears the count once typing stops.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 persona"));

    await user.clear(screen.getByRole("searchbox", { name: "Buscar persona" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Categoría" }),
      "Project Manager",
    );
    expect(names()).toEqual(["Person 3"]);
  });

  it("says nothing more for a chosen category with nobody in it than its heading and open role", async () => {
    const user = userEvent.setup();
    // Person 3, the only project manager, is inactive.
    renderBench(
      basis.people.map((person) =>
        person.id === personId(3) ? { ...person, active: false } : person,
      ),
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Categoría" }),
      "Project Manager",
    );
    expect(
      screen.getByRole("heading", { level: 3, name: /^Project Manager\s*0 personas$/ }),
    ).toBeInTheDocument();
    expect(openRoles()).toEqual(["Project Manager"]);
    expect(screen.queryByText("Nadie coincide con la búsqueda")).not.toBeInTheDocument();
  });

  it("offers to clear the filters when nobody matches", async () => {
    const user = userEvent.setup();
    renderBench();

    await user.type(screen.getByRole("searchbox", { name: "Buscar persona" }), "zz");
    expect(screen.getByText("Nadie coincide con la búsqueda")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(names()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: "Buscar persona" })).toHaveFocus();
  });

  it("shows no money", () => {
    const { container } = renderBench();
    expect(container.textContent).not.toContain("€");
  });
});
