import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PortfolioProject, PortfolioScenario } from "@/lib/portfolio/portfolio";
import { missing, onTarget } from "@/lib/portfolio/portfolio.fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ProjectHeader, ProjectScenarios } from "./project-page";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The project page: board 06's header, with the planned period and the description, and the
// project's scenarios, each leading to the editor. Synthetic names and figures.

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
  plannedPeriod: null,
  description: null,
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
/** The definition after a term of the header. */
const periodOf = (term: string) => screen.getByText(term, { selector: "dt" }).nextElementSibling!;
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

  it("shows the planned period and the description, the same without rate access", () => {
    const planned = {
      ...withoutRates,
      plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
      description: "A portal for the bank's clients.\nPhase one.",
    };
    renderWithIntl(<ProjectHeader project={planned} />);

    expect(plain(periodOf("Periodo previsto"))).toBe("1 abr – 30 sept 2027");
    const description = screen.getByText(/A portal for the bank's clients/);
    expect(description).toHaveTextContent("A portal for the bank's clients. Phase one.", {
      normalizeWhitespace: true,
    });
    expect(description).toHaveClass("whitespace-pre-line");
  });

  it("shows neither without a planned period or a description", () => {
    renderWithIntl(<ProjectHeader project={portal} />);

    expect(screen.queryByText("Periodo previsto")).toBeNull();
  });

  it("speaks English under /en", () => {
    renderWithIntl(
      <ProjectHeader
        project={{ ...portal, plannedPeriod: { start: "2027-04-01", end: "2027-09-30" } }}
      />,
      { locale: "en" },
    );

    expect(plain(periodOf("Planned period"))).toBe("Apr 1 – Sep 30, 2027");
  });

  it("shows no price without rate access", () => {
    renderWithIntl(<ProjectHeader project={withoutRates} />);

    expect(plain(document.body)).not.toMatch(/€|Precio:|Falta/);
    expect(screen.getByText("Precio cerrado")).toBeInTheDocument();
  });
});

describe("ProjectScenarios", () => {
  it("offers «Duplicar» on each scenario with rate access, named after it", async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: "failed" }));
    renderWithIntl(
      <ProjectScenarios project={portal} categories={categories} rateAccess duplicate={send} />,
    );
    const table = screen.getByRole("table", { name: "Escenarios" });
    const planB = within(table).getByRole("row", { name: /^Plan B/ });
    await userEvent.setup().click(within(planB).getByRole("button", { name: "Duplicar Plan B" }));
    expect(send).toHaveBeenCalledWith({ scenarioId: "s2", locale: "es" });
    expect(within(table).getAllByRole("button", { name: /^Duplicar / })).toHaveLength(
      portal.scenarios.length,
    );
    await expectNoAxeViolations();
  });

  it("offers no «Duplicar» without rate access: extra costs are restricted money", () => {
    renderWithIntl(
      <ProjectScenarios
        project={portal}
        categories={categories}
        rateAccess={false}
        duplicate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Duplicar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
  });

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

    expect(
      screen.getByRole("heading", { level: 3, name: "Este proyecto aún no tiene escenarios" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Un escenario es una forma de armar el equipo/)).toBeInTheDocument();
    expect(document.querySelector('[data-art="outline"]')).toBeInTheDocument();
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
