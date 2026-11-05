import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PortfolioProject, PortfolioScenario } from "@/lib/portfolio/portfolio";
import { missing, onTarget } from "@/lib/portfolio/portfolio.fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ProjectHeader, ProjectScenarios } from "./project-page";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The read-only project page: board 06's header, without «Editar proyecto», and the project's
// scenarios, each leading to the editor. Synthetic names and figures.

const scenario = (overrides: Partial<PortfolioScenario> & { id: string; name: string }) => ({
  chosen: false,
  people: 3,
  openRoles: 1,
  effectiveHours: 2380.5,
  money: onTarget,
  ...overrides,
});

const portal: PortfolioProject = {
  id: "p1",
  name: "Customer portal",
  client: "Demo Client",
  pricingModel: "fixed",
  price: { cents: 20_000_000 },
  scenarios: [
    scenario({ id: "s1", name: "Plan A", chosen: true }),
    scenario({ id: "s2", name: "Plan B", people: 2, openRoles: 0, money: missing(["data"]) }),
    scenario({ id: "s3", name: "Vacantes", people: 0, openRoles: 2 }),
    scenario({ id: "s4", name: "Draft", people: 0, openRoles: 0, effectiveHours: 0 }),
  ],
};

const withoutRates: PortfolioProject = {
  ...portal,
  price: null,
  scenarios: portal.scenarios.map((s) => ({ ...s, money: null })),
};

const categories = [{ id: "data", name: "Data Engineer" }];
const plain = (element: Element) => element.textContent?.replace(/[  ]/g, " ") ?? "";

describe("ProjectHeader", () => {
  it("names the project, its client, pricing model and price", () => {
    renderWithIntl(<ProjectHeader project={portal} />);

    expect(screen.getByRole("heading", { level: 1, name: "Customer portal" })).toBeInTheDocument();
    const details = plain(document.body);
    expect(details).toContain("Demo Client");
    expect(screen.getByText("Precio cerrado")).toHaveAttribute("data-slot", "chip");
    expect(details).toContain("200.000 €");
  });

  it("names a time-and-materials budget cap, or says there is none", () => {
    const { unmount } = renderWithIntl(
      <ProjectHeader project={{ ...portal, pricingModel: "time_and_materials" }} />,
    );
    expect(plain(document.body)).toContain("Tope de 200.000 €");
    unmount();

    renderWithIntl(
      <ProjectHeader
        project={{ ...portal, pricingModel: "time_and_materials", price: { cents: null } }}
      />,
    );
    expect(screen.getByText("Sin tope")).toBeInTheDocument();
  });

  it("says a fixed price is missing", () => {
    renderWithIntl(<ProjectHeader project={{ ...portal, price: { cents: null } }} />);

    expect(screen.getByText("Falta el precio")).toHaveAttribute("data-tone", "pending");
  });

  it("shows no price without rate access", () => {
    renderWithIntl(<ProjectHeader project={withoutRates} />);

    expect(plain(document.body)).not.toMatch(/€|Precio:|Falta/);
    expect(screen.getByText("Precio cerrado")).toBeInTheDocument();
  });
});

describe("ProjectScenarios", () => {
  it("lists each scenario, leading to the editor, with the chosen one marked", () => {
    renderWithIntl(<ProjectScenarios project={portal} categories={categories} rateAccess />);

    const table = screen.getByRole("table", { name: "Escenarios" });
    expect(within(table).getByRole("link", { name: "Plan A" })).toHaveAttribute(
      "href",
      "/scenarios/s1",
    );
    const planA = within(table).getByRole("row", { name: /^Plan A/ });
    expect(within(planA).getByText("Elegido")).toHaveAttribute("data-tone", "chosen");
    expect(within(table).getByRole("row", { name: /^Plan B/ })).not.toHaveTextContent("Elegido");
  });

  it("says each team's size, its effective hours, margin and status", () => {
    renderWithIntl(<ProjectScenarios project={portal} categories={categories} rateAccess />);

    const rows = screen.getAllByRole("row").slice(1).map(plain);
    expect(rows[0]).toContain("3 personas · 1 vacante");
    expect(rows[0]).toContain("2380,5 h");
    expect(rows[0]).toContain("63.356 € · 31,7 %");
    expect(rows[0]).toContain("En objetivo");
    expect(rows[1]).toContain("2 personas");
    expect(rows[1]).not.toContain("vacante");
    expect(rows[1]).toContain("Pendiente");
    expect(rows[1]).toContain("Falta el coste de Data Engineer");
    expect(rows[2]).toContain("2 vacantes");
    expect(rows[3]).toContain("Sin equipo");
  });

  it("has no margin or status columns without rate access", () => {
    renderWithIntl(
      <ProjectScenarios project={withoutRates} categories={categories} rateAccess={false} />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Escenario",
      "Equipo",
      "Horas efectivas",
    ]);
    expect(plain(document.body)).not.toMatch(/€|%|Pendiente|Falta/);
  });

  it("says a project has no scenarios yet, offering nothing to create", () => {
    renderWithIntl(
      <ProjectScenarios
        project={{ ...portal, scenarios: [] }}
        categories={categories}
        rateAccess
      />,
    );

    expect(screen.getByText("Este proyecto aún no tiene escenarios.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("speaks English under /en", () => {
    renderWithIntl(<ProjectScenarios project={portal} categories={categories} rateAccess />, {
      locale: "en",
    });

    expect(screen.getByRole("table", { name: "Scenarios" })).toHaveTextContent(
      "3 people · 1 open role",
    );
  });

  it("has no accessibility violations, with or without rate access", async () => {
    const { unmount } = renderWithIntl(
      <>
        <ProjectHeader project={portal} />
        <ProjectScenarios project={portal} categories={categories} rateAccess />
      </>,
    );
    await expectNoAxeViolations();
    unmount();

    renderWithIntl(
      <>
        <ProjectHeader project={withoutRates} />
        <ProjectScenarios project={withoutRates} categories={categories} rateAccess={false} />
      </>,
    );
    await expectNoAxeViolations();
  });
});
