import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { PeopleList } from "./people-list";
import type { SavePersonAction } from "./person-sheet";

vi.mock("next/navigation", () => import("@/test/navigation"));

// Board 07 as ADR 0017's list: everyone in the organization reads its people, since they hold no
// money. Rule j's warning shows with rate access only; writing is for a signed-in member with rate
// access. The search, tab, category and order live in the URL.

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
  {
    id: "0b5e0c1e-0000-4000-8000-000000000012",
    name: "Ana Peña",
    categoryId: PM,
    weeklyHours: 40,
    area: null,
    active: true,
    occupancy: 0,
  },
];
const action = vi.fn<SavePersonAction>();

const list = () => screen.getByRole("list", { name: "Personas" });
const rows = () => within(list()).getAllByRole("listitem");
const tabs = () => screen.getByRole("tablist", { name: "Filtrar personas" });

function renderList(props: Partial<Parameters<typeof PeopleList>[0]> = {}) {
  return renderWithIntl(
    <PeopleList
      people={people}
      categories={categories}
      defaultWeeklyHours={40}
      rates={null}
      action={null}
      {...props}
    />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/people");
});

describe("PeopleList", () => {
  it("names the page with its count, and lists the active people by name", () => {
    renderList();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Personas3 personas");
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Ana Peña"),
      expect.stringContaining("Irene Sanz"),
    ]);
    const irene = rows()[1]!;
    expect(irene).toHaveTextContent("DevOps Engineer· Plataforma· 37,5 h/sem");
    expect(irene).toHaveTextContent("120 % hoy");
  });

  it("counts each tab and shows the inactive ones under their own tab", async () => {
    renderList();

    expect(
      within(tabs())
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Activas 2", "Libres hoy 1", "Más del 100 % 1", "Inactivas 1"]);
    await userEvent.click(within(tabs()).getByRole("tab", { name: /Inactivas/ }));

    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]!).getByText("Marc Puig")).toBeInTheDocument();
    expect(within(rows()[0]!).getByText("Inactiva")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=inactive");
  });

  it("searches without accents, keeps the search in the URL, and clears the filters", async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByRole("searchbox", { name: /Buscar por nombre/ }), "pena");
    expect(rows()).toHaveLength(1);
    expect(window.location.search).toBe("?q=pena");
    expect(screen.getByText("1 persona")).toHaveAttribute("role", "status");

    await user.type(screen.getByRole("searchbox"), "x");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Ninguna persona coincide");
    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(rows()).toHaveLength(2);
    // The button went with the empty state: the search keeps the focus.
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(window.location.search).toBe("");
  });

  it("opens as the URL left it: tab, category, order and search", () => {
    window.history.replaceState(null, "", `/people?tab=free&category=${PM}&order=occupancy`);
    renderList();

    expect(within(tabs()).getByRole("tab", { name: /Libres hoy/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Categoría: Project Manager" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Orden: Ocupación" })).toBeInTheDocument();
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining("Ana Peña")]);
  });

  it("without rate access shows no warning and offers no writing", () => {
    renderList();

    expect(screen.queryByText(/Categoría pequeña/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Añadir persona|Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /hoja de cálculo/ })).not.toBeInTheDocument();
  });

  it("with rate access marks small categories (rule j), with the whole rule for screen readers", () => {
    renderList({ rates: { pending: [], small: [{ categoryId: DEVOPS, activePeople: 1 }] } });

    const irene = rows()[1]!;
    // Short on screen; the whole rule, once, for screen readers.
    expect(within(irene).getByText("Categoría pequeña")).toHaveAttribute("aria-hidden", "true");
    expect(
      within(irene).getByText("Categoría pequeña: su coste puede revelar un salario"),
    ).toHaveClass("sr-only");
    expect(within(rows()[0]!).queryByText(/Categoría pequeña/)).not.toBeInTheDocument();
  });

  it("offers adding and editing to a member who may write", () => {
    renderList({ rates: { pending: [], small: [] }, action });

    expect(screen.getByRole("button", { name: "Añadir persona" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Irene Sanz" })).toBeInTheDocument();
    // ADR 0016: or bring them all from a spreadsheet, the import's people file alone.
    expect(
      screen.getByRole("link", { name: "Importar desde una hoja de cálculo" }),
    ).toHaveAttribute("href", "/import?file=people");
  });

  it("asks for a category before the first person", () => {
    renderList({ people: [], categories: [], action });

    expect(screen.queryByRole("button", { name: "Añadir persona" })).not.toBeInTheDocument();
    expect(screen.getByText(/Aún no hay personas/)).toBeInTheDocument();
    expect(screen.getByText(/primero una categoría/)).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    // The import creates a category a person names.
    expect(screen.getByRole("link", { name: "Importar desde una hoja de cálculo" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    renderList({
      rates: { pending: [], small: [{ categoryId: DEVOPS, activePeople: 1 }] },
      action,
    });
    await expectNoAxeViolations();
  });
});
