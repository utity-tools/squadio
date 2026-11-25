import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { PeopleList } from "./people-list";
import type { SavePersonAction } from "./person-sheet";

// Board 07's table: everyone in the organization reads its people, since they hold no money.
// Rule j's warning and which categories are pending show with rate access only; writing is for a
// signed-in member with rate access.

const DEVOPS = "0b5e0c1e-0000-4000-8000-000000000003";
const PM = "0b5e0c1e-0000-4000-8000-000000000004";
const categories = [
  { id: DEVOPS, name: "DevOps Engineer" },
  { id: PM, name: "Project Manager" },
];
const people = [
  {
    id: "0b5e0c1e-0000-4000-8000-000000000010",
    name: "Irene Sanz",
    categoryId: DEVOPS,
    weeklyHours: 37.5,
    area: "Plataforma",
    active: true,
    occupancy: 120,
  },
  {
    id: "0b5e0c1e-0000-4000-8000-000000000011",
    name: "Marc Puig",
    categoryId: PM,
    weeklyHours: 40,
    area: null,
    active: false,
    occupancy: 0,
  },
];
const action = vi.fn<SavePersonAction>();

const rows = () => screen.getAllByRole("row").slice(1);

describe("PeopleList", () => {
  it("lists each person's category, weekly hours, area, occupancy and status", () => {
    renderWithIntl(
      <PeopleList
        people={people}
        categories={categories}
        defaultWeeklyHours={40}
        rates={null}
        action={null}
      />,
    );
    const [irene, marc] = rows();
    expect(
      within(irene!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent?.replace(/\s/g, " ")),
    ).toEqual(["Irene Sanz", "DevOps Engineer", "37,5 h/sem", "Plataforma", "120 %", "Activa"]);
    expect(within(marc!).getByText("Inactiva")).toBeInTheDocument();
    expect(within(marc!).getAllByRole("cell")[3]).toHaveAccessibleName("Sin área");
  });

  it("without rate access shows no warning and offers no writing", () => {
    renderWithIntl(
      <PeopleList
        people={people}
        categories={categories}
        defaultWeeklyHours={40}
        rates={null}
        action={null}
      />,
    );
    expect(screen.queryByText(/Categoría pequeña/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Añadir persona|Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /hoja de cálculo/ })).not.toBeInTheDocument();
  });

  it("with rate access marks small categories (rule j)", () => {
    renderWithIntl(
      <PeopleList
        people={people}
        categories={categories}
        defaultWeeklyHours={40}
        rates={{ pending: [], small: [{ categoryId: DEVOPS, activePeople: 1 }] }}
        action={null}
      />,
    );
    const [irene, marc] = rows();
    expect(within(irene!).getByText(/Categoría pequeña/)).toBeInTheDocument();
    expect(within(marc!).queryByText(/Categoría pequeña/)).not.toBeInTheDocument();
  });

  it("offers adding and editing to a member who may write", () => {
    renderWithIntl(
      <PeopleList
        people={people}
        categories={categories}
        defaultWeeklyHours={40}
        rates={{ pending: [], small: [] }}
        action={action}
      />,
    );
    expect(screen.getByRole("button", { name: "Añadir persona" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Irene Sanz" })).toBeInTheDocument();
    // ADR 0016: or bring them all from a spreadsheet, the import's people file alone.
    expect(
      screen.getByRole("link", { name: "Importar desde una hoja de cálculo" }),
    ).toHaveAttribute("href", "/import?file=people");
  });

  it("asks for a category before the first person", () => {
    renderWithIntl(
      <PeopleList
        people={[]}
        categories={[]}
        defaultWeeklyHours={40}
        rates={null}
        action={action}
      />,
    );
    expect(screen.queryByRole("button", { name: "Añadir persona" })).not.toBeInTheDocument();
    expect(screen.getByText(/Aún no hay personas/)).toBeInTheDocument();
    expect(screen.getByText(/primero una categoría/)).toBeInTheDocument();
    // The import creates a category a person names.
    expect(screen.getByRole("link", { name: "Importar desde una hoja de cálculo" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    renderWithIntl(
      <PeopleList
        people={people}
        categories={categories}
        defaultWeeklyHours={40}
        rates={{ pending: [], small: [{ categoryId: DEVOPS, activePeople: 1 }] }}
        action={action}
      />,
    );
    await expectNoAxeViolations();
  });
});
