import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Portfolio, PortfolioProject, PortfolioScenario } from "@/lib/portfolio/portfolio";
import { missing, onTarget } from "@/lib/portfolio/portfolio.fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ProjectsTable } from "./projects-table";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Boards 01 and 14: a project's margin is one scenario's, never a sum (docs/domain.md, "A
// project's margin"). Synthetic names and figures.

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

const plain = (element: Element) => element.textContent?.replace(/[  ]/g, " ") ?? "";
const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(`^${name}`) });

describe("ProjectsTable", () => {
  it("names each project with its client and pricing model, leading to its page", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);

    const row = rowOf("Support retainer");
    expect(within(row).getByRole("link", { name: "Support retainer" })).toHaveAttribute(
      "href",
      "/projects/p3",
    );
    expect(row).toHaveTextContent("Demo Client · Tiempo y materiales");
  });

  it("shows the chosen scenario's margin and status", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);

    const row = rowOf("Customer portal");
    expect(within(row).getByText("Elegido")).toHaveAttribute("data-tone", "chosen");
    expect(plain(row)).toContain("Plan A");
    expect(plain(row)).toContain("63.356 € · 31,7 %");
    expect(within(row).getByText("En objetivo")).toHaveAttribute("data-tone", "ok");
  });

  it("marks an only scenario as not chosen, and says what its pending margin misses", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);

    const row = rowOf("Internal tooling");
    expect(plain(row)).toContain("First draft sin elegir");
    expect(within(row).getByText("Pendiente")).toHaveAttribute("data-tone", "pending");
    expect(row).toHaveTextContent("Falta el precio");
    expect(plain(rowOf("Data lake"))).toContain("Falta el coste de Data Engineer");
  });

  it("shows no margin for several unchosen scenarios, only how many there are", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);

    const row = rowOf("Support retainer");
    expect(row).toHaveTextContent("Sin elegir · 2 escenarios");
    expect(plain(row)).not.toContain("€");
    expect(within(row).queryByText("Pendiente")).toBeNull();
    expect(rowOf("Empty idea")).toHaveTextContent("Sin escenarios");
  });

  it("says that margins of different projects are not added", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);

    expect(
      screen.getByText(
        "El margen es el del escenario elegido de cada proyecto, o el de su único escenario si no ha elegido ninguno. Los márgenes de proyectos distintos no se suman.",
      ),
    ).toBeInTheDocument();
  });

  it("has no margin or status columns without rate access, and no money", () => {
    const { container } = renderWithIntl(
      <ProjectsTable portfolio={withoutRates} label="Proyectos" />,
    );

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Proyecto", "Escenario"]);
    expect(plain(container)).not.toMatch(/€|%|Pendiente|Falta/);
    expect(rowOf("Customer portal")).toHaveTextContent("Plan A Elegido");
    expect(
      screen.getByText("Los márgenes los ven las personas con acceso a tarifas."),
    ).toBeInTheDocument();
  });

  it("lets the keyboard reach the scroller, so narrow windows still show every column", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);

    expect(screen.getByRole("group", { name: "Proyectos" })).toHaveAttribute("tabindex", "0");
  });

  it("shows only the first projects it is given", () => {
    renderWithIntl(
      <ProjectsTable portfolio={portfolio} projects={projects.slice(0, 2)} label="Proyectos" />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("speaks English under /en", () => {
    renderWithIntl(<ProjectsTable portfolio={portfolio} label="Projects" />, { locale: "en" });

    expect(screen.getByRole("table", { name: "Projects" })).toBeInTheDocument();
    expect(rowOf("Support retainer")).toHaveTextContent("Not chosen · 2 scenarios");
    expect(plain(rowOf("Customer portal"))).toContain("€63,356 · 31.7%");
  });

  it("has no accessibility violations, with or without rate access", async () => {
    const { unmount } = renderWithIntl(<ProjectsTable portfolio={portfolio} label="Proyectos" />);
    await expectNoAxeViolations();
    unmount();

    renderWithIntl(<ProjectsTable portfolio={withoutRates} label="Proyectos" />);
    await expectNoAxeViolations();
  });
});
