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

function renderBench(people = basis.people, overrides: Partial<ScenarioBasis> = {}) {
  const stores: ScenarioStore[] = [];
  const view = renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis: { ...basis, people, ...overrides }, team, version: 1 }}
        save={never}
      >
        <Bench day="2026-10-29" />
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

  it("says which day occupancy is measured on, and that it is not availability during the project", () => {
    renderBench();
    expect(
      screen.getByText(
        "Ocupación a 29 de octubre de 2026, según los escenarios elegidos en Squadio. No es la disponibilidad durante el proyecto.",
      ),
    ).toBeInTheDocument();
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
    expect(screen.queryByText(/Nadie coincide/)).not.toBeInTheDocument();
  });

  it("offers to clear the filters when nobody matches", async () => {
    const user = userEvent.setup();
    renderBench();

    await user.type(screen.getByRole("searchbox", { name: "Buscar persona" }), "zz");
    expect(
      screen.getByRole("heading", { level: 3, name: "Nadie coincide con «zz»" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Prueba con otro nombre.")).toBeInTheDocument();
    expect(document.querySelector('[data-art="search"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(names()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: "Buscar persona" })).toHaveFocus();
  });

  it("suggests clearing the category too when one is chosen", async () => {
    const user = userEvent.setup();
    renderBench();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Categoría" }),
      "Project Manager",
    );
    await user.type(screen.getByRole("searchbox", { name: "Buscar persona" }), "zz");
    expect(
      screen.getByText("Prueba con otro nombre o quita el filtro de categoría."),
    ).toBeInTheDocument();
  });

  it("shows no money", () => {
    const { container } = renderBench();
    expect(container.textContent).not.toContain("€");
  });

  describe("weekly load", () => {
    // The team spans 1 April to 29 September 2027; person 1 leads it at 100% and person 3 manages
    // it at 100%. Another project's chosen scenario adds person 1 at 50% for four weeks of April.
    const commitments = [
      {
        id: "commitment-1",
        personId: personId(1),
        projectId: "project-2",
        projectName: "Project 2",
        allocation: 50,
        startDate: "2027-04-05",
        endDate: "2027-04-30",
      },
    ];

    it("sums up each person's weeks, and says load is what Squadio knows", () => {
      renderBench(basis.people, { commitments });
      expect(within(card("Person 1")).getByText("4 semanas por encima del 100 %")).toBeVisible();
      expect(within(card("Person 3")).getByText("Semana de más carga: 100 %")).toBeVisible();
      expect(
        within(card("Person 2")).getByText("Sin carga registrada en estas semanas"),
      ).toBeVisible();
      expect(
        screen.getByText(/una semana vacía no significa que la persona esté libre/),
      ).toBeVisible();
    });

    it("lists the weeks with their load from the keyboard", async () => {
      const user = userEvent.setup();
      renderBench(basis.people, { commitments });
      const toggle = within(card("Person 1")).getByRole("button", { name: /^Ver semanas de / });
      expect(toggle).toHaveAccessibleName("Ver semanas de Person 1");
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      toggle.focus();
      await user.keyboard("{Enter}");
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(toggle).toHaveAccessibleName(/^Ocultar semanas de /);
      const weeks = within(screen.getByRole("list", { name: "Carga semanal de Person 1" }));
      expect(weeks.getAllByRole("listitem")).toHaveLength(27);
      expect(weeks.getByText("Semana del 5 abr 2027").closest("li")).toHaveTextContent(
        /150 %.*sobreasignación/,
      );
      expect(weeks.getByText("Semana del 3 may 2027").closest("li")).toHaveTextContent("100 %");
      expect(weeks.getByText("Semana del 3 may 2027").closest("li")).not.toHaveTextContent(
        "sobreasignación",
      );

      await user.keyboard("{Enter}");
      expect(
        screen.queryByRole("list", { name: "Carga semanal de Person 1" }),
      ).not.toBeInTheDocument();
    });

    it("shows an over-allocated week that rounds to 100% as above it", async () => {
      const user = userEvent.setup();
      renderBench(basis.people, {
        commitments: [{ ...commitments[0]!, allocation: 1, endDate: "2027-04-05" }],
      });
      await user.click(within(card("Person 1")).getByRole("button", { name: /^Ver semanas de / }));
      // 100% + 1% × 1/5 = 100.2%.
      expect(screen.getByText("Semana del 5 abr 2027").closest("li")).toHaveTextContent(">100 %");
    });

    it("has no weeks without a team or a planned period", () => {
      const stores = renderBench(basis.people, { commitments });
      act(() => {
        for (const member of [...team].reverse()) {
          stores.store.getState().dispatch({ type: "remove", id: member.id });
        }
      });
      expect(screen.queryByRole("button", { name: /^Ver semanas de / })).not.toBeInTheDocument();
      expect(screen.queryByText(/una semana vacía/)).not.toBeInTheDocument();
    });
  });
});
