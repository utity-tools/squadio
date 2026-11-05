import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Portfolio, PortfolioProject, PortfolioScenario } from "@/lib/portfolio/portfolio";
import { missing, onTarget, overCap } from "@/lib/portfolio/portfolio.fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { Dashboard } from "./dashboard";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Inicio (boards 01 and 14; board 04's «Qué verás aquí» for an empty organization), over the
// decisions of 2026-11-05. Synthetic names and figures.

const scenario = (
  id: string,
  name: string,
  { chosen = false, money = onTarget as PortfolioScenario["money"] } = {},
): PortfolioScenario => ({
  id,
  name,
  chosen,
  people: 3,
  openRoles: 0,
  effectiveHours: 1000,
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
  project("portal", "Customer portal", [
    scenario("plan-a", "Plan A"),
    scenario("plan-b", "Plan B"),
  ]),
  project("tooling", "Internal tooling", [
    scenario("draft", "First draft", { money: missing([], { price: true }) }),
  ]),
  project(
    "mobile",
    "Mobile app",
    [scenario("delivery", "Delivery plan", { chosen: true })],
    "time_and_materials",
  ),
  project(
    "upkeep",
    "Platform upkeep",
    [scenario("run", "Run plan", { chosen: true })],
    "time_and_materials",
  ),
  project(
    "retainer",
    "Support retainer",
    [
      scenario("data", "Data platform", { money: missing(["data"]) }),
      scenario("over", "Over budget", { money: overCap }),
    ],
    "time_and_materials",
  ),
];

const portfolio: Portfolio = {
  rateAccess: true,
  projects,
  categories: [
    { id: "data", name: "Data Engineer" },
    { id: "pm", name: "Project Manager" },
    { id: "senior", name: "Senior Developer" },
  ],
  activePeople: 15,
  occupancy: [
    { category: { id: "pm", name: "Project Manager" }, percent: 60 },
    { category: { id: "senior", name: "Senior Developer" }, percent: 115 },
  ],
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

const empty: Portfolio = { ...portfolio, projects: [], occupancy: [] };

const props = { organization: "Consultora Demo", today: "2026-11-05" };
const plain = (element: Element) => element.textContent?.replace(/[  ]/g, " ") ?? "";
const card = (label: string) => screen.getByText(label, { selector: "p" }).parentElement!;

describe("Dashboard", () => {
  it("names the organization and today, and leads to the projects", () => {
    renderWithIntl(<Dashboard portfolio={portfolio} {...props} />);

    expect(screen.getByRole("heading", { level: 1, name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByText("Consultora Demo · jueves, 5 nov 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver proyectos" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("counts the projects, those with a chosen scenario, the corrections and the people", () => {
    renderWithIntl(<Dashboard portfolio={portfolio} {...props} />);

    expect(plain(card("Proyectos"))).toBe("Proyectos5");
    expect(plain(card("Con escenario elegido"))).toBe("Con escenario elegido2 de 5");
    expect(card("Correcciones pendientes")).toHaveAttribute("data-pending");
    expect(plain(card("Correcciones pendientes"))).toBe("Correcciones pendientes4");
    expect(plain(card("Personas activas"))).toBe("Personas activas15");
  });

  it("lists the projects with their margins, saying they are not added", () => {
    renderWithIntl(<Dashboard portfolio={portfolio} {...props} />);

    const panel = screen.getByRole("region", { name: "Proyectos" });
    expect(within(panel).getByRole("link", { name: "Ver todos" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(panel).getAllByRole("row")).toHaveLength(6);
    expect(panel).toHaveTextContent("Los márgenes de proyectos distintos no se suman.");
  });

  it("shows only the first five projects", () => {
    const more = [...projects, project("zeta", "Zeta", []), project("omega", "Omega", [])];
    renderWithIntl(<Dashboard portfolio={{ ...portfolio, projects: more }} {...props} />);

    const panel = screen.getByRole("region", { name: "Proyectos" });
    expect(within(panel).getAllByRole("row")).toHaveLength(6);
    expect(plain(card("Proyectos"))).toBe("Proyectos7");
  });

  it("lists each pending correction once, with where it applies and a link to it", () => {
    renderWithIntl(<Dashboard portfolio={portfolio} {...props} />);

    const panel = screen.getByRole("region", { name: "Correcciones pendientes · 4" });
    const items = within(panel).getAllByRole("listitem");
    expect(items.map(plain)).toEqual([
      "FaltaCoste de Data EngineerSupport retainer › Data platform · coste y márgenes pendientesAbrir el escenario: Data platform de Support retainer",
      "FaltaTarifa de venta de Data EngineerSupport retainer › Data platform · ingresos y márgenes pendientesAbrir el escenario: Data platform de Support retainer",
      "FaltaPrecio de Internal toolingInternal tooling › First draft · ingresos y márgenes pendientesAbrir el proyecto: Internal tooling",
      "AvisoTope de presupuesto superadoSupport retainer › Over budget · los ingresos superan el topeAbrir el escenario: Over budget de Support retainer",
    ]);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/scenarios/data");
    expect(within(items[2]!).getByRole("link")).toHaveAttribute("href", "/projects/tooling");
    expect(within(items[0]!).getByText("Falta")).toHaveAttribute("data-tone", "pending");
    expect(within(items[3]!).getByText("Aviso")).toHaveAttribute("data-tone", "warn");
  });

  it("says how many more scenarios a correction affects", () => {
    const twice = projects.map((p) =>
      p.id === "portal"
        ? { ...p, scenarios: p.scenarios.map((s) => ({ ...s, money: missing(["data"]) })) }
        : p,
    );
    renderWithIntl(<Dashboard portfolio={{ ...portfolio, projects: twice }} {...props} />);

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "Customer portal › Plan A y 2 escenarios más · coste y márgenes pendientes",
    );
  });

  it("says when there is nothing to correct", () => {
    const fine = projects.map((p) => ({
      ...p,
      scenarios: p.scenarios.map((s) => ({ ...s, money: onTarget })),
    }));
    renderWithIntl(<Dashboard portfolio={{ ...portfolio, projects: fine }} {...props} />);

    expect(card("Correcciones pendientes")).not.toHaveAttribute("data-pending");
    expect(plain(card("Correcciones pendientes"))).toBe("Correcciones pendientes0");
    expect(screen.getByRole("region", { name: "Correcciones pendientes · 0" })).toHaveTextContent(
      "Nada que corregir.",
    );
  });

  it("shows today's occupancy by category, a full bar past 100%", () => {
    renderWithIntl(<Dashboard portfolio={portfolio} {...props} />);

    const panel = screen.getByRole("region", { name: "Ocupación hoy por categoría" });
    expect(panel).toHaveTextContent(
      "Ocupación de hoy según los escenarios elegidos en Squadio. No es la disponibilidad durante los proyectos.",
    );
    const items = within(panel).getAllByRole("listitem");
    expect(items.map(plain)).toEqual(["Project Manager60 %", "Senior Developer115 %"]);
    const bars = panel.querySelectorAll<HTMLElement>("[data-slot='occupancy-bar']");
    expect(bars[0]).toHaveStyle({ width: "60%" });
    expect(bars[1]).toHaveStyle({ width: "100%" });
    expect(bars[1]).toHaveClass("bg-status-warn");
  });

  it("without rate access shows projects, their scenario, people and occupancy, and no money", () => {
    const { container } = renderWithIntl(<Dashboard portfolio={withoutRates} {...props} />);

    expect(screen.queryByText("Correcciones pendientes", { exact: false })).toBeNull();
    expect(plain(container)).not.toMatch(/€|Pendiente|Falta|Aviso/);
    expect(screen.getByRole("region", { name: "Proyectos" })).toHaveTextContent("Delivery plan");
    expect(plain(card("Personas activas"))).toBe("Personas activas15");
    expect(screen.getByRole("region", { name: "Ocupación hoy por categoría" })).toBeInTheDocument();
  });

  it("shows an empty organization only what it will see here", () => {
    renderWithIntl(<Dashboard portfolio={empty} organization="Mi consultora" today="2026-11-05" />);

    expect(screen.getByText("Mi consultora · tu organización está lista")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Qué verás aquí" })).toHaveTextContent(
      "Cuando tengas proyectos, este Inicio te enseña sus márgenes, lo que falta por corregir y la ocupación de hoy.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Proyectos", { selector: "p" })).toBeNull();
  });

  it("tells an empty organization without rate access about scenarios, not margins", () => {
    renderWithIntl(
      <Dashboard
        portfolio={{ ...empty, rateAccess: false }}
        organization="Mi consultora"
        today="2026-11-05"
      />,
    );

    expect(screen.getByRole("region", { name: "Qué verás aquí" })).toHaveTextContent(
      "Cuando tengas proyectos, este Inicio te enseña sus escenarios elegidos y la ocupación de hoy.",
    );
  });

  it("speaks English under /en", () => {
    renderWithIntl(<Dashboard portfolio={portfolio} {...props} organization="Demo Consultancy" />, {
      locale: "en",
    });

    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("Demo Consultancy · Thursday, Nov 5, 2026")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Cost of Data Engineer");
  });

  it("has no accessibility violations, full, without rate access and empty", async () => {
    for (const shown of [portfolio, withoutRates, empty]) {
      const { unmount } = renderWithIntl(<Dashboard portfolio={shown} {...props} />);
      await expectNoAxeViolations();
      unmount();
    }
  });
});
