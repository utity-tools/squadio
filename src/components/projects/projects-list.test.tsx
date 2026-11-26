import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Portfolio, PortfolioProject, PortfolioScenario } from "@/lib/portfolio/portfolio";
import { missing, onTarget } from "@/lib/portfolio/portfolio.fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ProjectsList } from "./projects-list";

vi.mock("next/navigation", () => import("@/test/navigation"));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The projects page as ADR 0017's list: a search, tabs with counts, an order, one row per
// project. A project's margin is one scenario's, never a sum (docs/domain.md, "A project's
// margin"). Synthetic names and figures.

const scenario = (
  id: string,
  name: string,
  { chosen = false, money = onTarget as PortfolioScenario["money"] } = {},
): PortfolioScenario => ({
  id,
  name,
  chosen,
  people: 3,
  openRoles: 1,
  effectiveHours: 2380,
  money,
});

const project = (
  id: string,
  name: string,
  scenarios: PortfolioScenario[],
  pricingModel: PortfolioProject["pricingModel"] = "fixed",
): PortfolioProject => ({
  id,
  name,
  client: "Demo Client",
  pricingModel,
  plannedPeriod: null,
  description: null,
  price: { cents: 20_000_000 },
  scenarios,
});

const projects = [
  project("p1", "Customer portal", [
    scenario("s1", "Plan A", { chosen: true }),
    scenario("s2", "Plan B"),
  ]),
  project("p2", "Internal tooling", [
    scenario("s3", "First draft", { money: missing([], { price: true }) }),
  ]),
  project(
    "p3",
    "Support retainer",
    [scenario("s4", "Data platform"), scenario("s5", "Over budget")],
    "time_and_materials",
  ),
  project("p4", "Data lake", [scenario("s6", "Draft", { money: missing(["data"]) })]),
  project("p5", "Empty idea", []),
];

const portfolio: Portfolio = {
  rateAccess: true,
  projects,
  categories: [{ id: "data", name: "Data Engineer" }],
  activePeople: 15,
  occupancy: [],
};

const withoutRates: Portfolio = {
  ...portfolio,
  rateAccess: false,
  projects: projects.map((p) => ({
    ...p,
    price: null,
    scenarios: p.scenarios.map((s) => ({ ...s, money: null })),
  })),
};

const plain = (element: Element) => element.textContent?.replace(/[\u00a0\u202f]/g, " ") ?? "";
const list = () => screen.getByRole("list", { name: "Proyectos" });
const names = () =>
  within(list())
    .getAllByRole("link")
    .map((link) => link.textContent);
const rowOf = (name: string) => screen.getByRole("link", { name }).closest("li") as HTMLElement;
const tabs = () => screen.getByRole("tablist", { name: "Filtrar proyectos" });

beforeEach(() => {
  window.history.replaceState(null, "", "/projects");
});

describe("ProjectsList", () => {
  it("lists every project, riskiest first, each on one row leading to its page", () => {
    renderWithIntl(<ProjectsList portfolio={portfolio} label="Proyectos" />);

    // A pending margin, then none, then on target; ties by name.
    expect(names()).toEqual([
      "Data lake",
      "Internal tooling",
      "Empty idea",
      "Support retainer",
      "Customer portal",
    ]);
    const row = rowOf("Customer portal");
    expect(within(row).getByRole("link", { name: "Customer portal" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(row).toHaveTextContent("Demo Client · Precio cerrado");
    expect(within(row).getByText("Elegido")).toHaveAttribute("data-tone", "chosen");
    expect(plain(row)).toContain("· 2 escenarios");
    expect(plain(row)).toContain("63.356 € · 31,7 %");
    expect(within(row).getByText("En objetivo")).toHaveAttribute("data-tone", "ok");
  });

  it("counts each tab, and filters by tab and search, both kept in the URL", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ProjectsList portfolio={portfolio} label="Proyectos" />);

    expect(
      within(tabs())
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Todos 5", "Por decidir 4", "En riesgo 0", "En objetivo 1"]);
    await user.click(within(tabs()).getByRole("tab", { name: /Por decidir/ }));
    expect(names()).not.toContain("Customer portal");
    expect(window.location.search).toBe("?tab=decide");

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar por proyecto o cliente" }),
      "data",
    );
    expect(names()).toEqual(["Data lake"]);
    expect(window.location.search).toBe("?tab=decide&q=data");
  });

  it("orders by name from its menu", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ProjectsList portfolio={portfolio} label="Proyectos" />);

    await user.click(screen.getByRole("button", { name: "Orden: Riesgo" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Nombre" }));
    expect(names()).toEqual([
      "Customer portal",
      "Data lake",
      "Empty idea",
      "Internal tooling",
      "Support retainer",
    ]);
    expect(window.location.search).toBe("?order=name");
  });

  it("says when the filters leave nothing, and clears them", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/projects?tab=ok&q=tooling");
    renderWithIntl(<ProjectsList portfolio={portfolio} label="Proyectos" />);

    expect(screen.getByRole("heading", { name: "Ningún proyecto coincide" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(names()).toHaveLength(5);
    expect(window.location.search).toBe("");
  });

  it("says that margins of different projects are not added", () => {
    renderWithIntl(<ProjectsList portfolio={portfolio} label="Proyectos" />);

    expect(
      screen.getByText(
        "El margen es el del escenario elegido de cada proyecto, o el de su único escenario si no ha elegido ninguno. Los márgenes de proyectos distintos no se suman.",
      ),
    ).toBeInTheDocument();
  });

  it("has no money tabs, order or figures without rate access, by name (ADR 0005)", () => {
    window.history.replaceState(null, "", "/projects?tab=risk&order=risk");
    const { container } = renderWithIntl(
      <ProjectsList portfolio={withoutRates} label="Proyectos" />,
    );

    expect(
      within(tabs())
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Todos 5", "Por decidir 4"]);
    expect(screen.queryByRole("button", { name: /Orden/ })).not.toBeInTheDocument();
    expect(names()[0]).toBe("Customer portal");
    expect(plain(container)).not.toMatch(/€|%|Pendiente|Falta/);
  });

  it("has no accessibility violations, with or without rate access", async () => {
    const { unmount } = renderWithIntl(<ProjectsList portfolio={portfolio} label="Proyectos" />);
    await expectNoAxeViolations();
    unmount();

    renderWithIntl(<ProjectsList portfolio={withoutRates} label="Proyectos" />);
    await expectNoAxeViolations();
  });
});
