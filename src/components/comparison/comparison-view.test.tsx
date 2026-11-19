import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { compareScenarios } from "@/lib/comparison/compare";
import {
  PLAN_A,
  PLAN_B,
  compared,
  guidePlans,
  planView,
  withoutRateAccess,
} from "@/lib/comparison/comparison.fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ComparisonView } from "./comparison-view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// docs/domain.md, "Comparing scenarios": Plans A, B and C of the comparison examples.

const plain = (element: Element | null) =>
  element?.textContent?.replace(/[\u00a0\u202f]/g, " ") ?? "";

/** The row named `name` in the section titled `section`. */
const rowOf = (section: string, name: string, nth = 0) => {
  const table = screen.getByRole("table", { name: section });
  const rows = within(table)
    .getAllByRole("rowheader")
    .filter((header) => plain(header) === name);
  const row = rows[nth]?.closest("tr");
  if (!row) throw new Error(`no row ${name} in ${section}`);
  return [...row.querySelectorAll("td")].map(plain);
};

describe("ComparisonView", () => {
  it("shows the result lines with their differences from the baseline", () => {
    renderWithIntl(<ComparisonView comparison={compareScenarios(guidePlans())} />);

    expect(rowOf("Resultado", "Coste total")).toEqual([
      "139.791,05 €",
      "126.761,04 €-13.030,01 €",
      "117.079,71 €-22.711,34 €",
    ]);
    expect(rowOf("Resultado", "Ingresos")[1]).toBe("200.000,00 €Sin cambio");
    expect(rowOf("Resultado", "Margen neto")).toEqual([
      "60.208,95 € · 30,1 %",
      "73.238,96 € · 36,62 %+13.030,01 € · +6,52 pp",
      "82.920,29 € · 41,46 %+22.711,34 € · +11,36 pp",
    ]);
  });

  it("reads the effective rate first with a fixed price", () => {
    renderWithIntl(<ComparisonView comparison={compareScenarios(guidePlans())} />);
    const table = screen.getByRole("table", { name: "Resultado" });

    expect(plain(within(table).getAllByRole("rowheader")[0] ?? null)).toBe("Tarifa efectiva");
    expect(rowOf("Resultado", "Tarifa efectiva")[2]).toBe("98,46 €/h+16,41 €/h");
  });

  it("marks the baseline, the chosen scenario and its frozen values", () => {
    renderWithIntl(<ComparisonView comparison={compareScenarios(guidePlans())} />);
    const [head] = screen.getAllByRole("table");
    const planA = within(head!).getAllByRole("columnheader")[1]!;

    expect(within(planA).getByRole("link", { name: "Plan A" })).toHaveAttribute(
      "href",
      "/scenarios/A",
    );
    expect(plain(planA)).toMatch(/Referencia.*Elegido.*Valores congelados/);
    expect(screen.getByText(/Plan A está elegido/)).toBeInTheDocument();
  });

  it("says a category is not on a team, never 0 €, and still gives its difference", () => {
    renderWithIntl(<ComparisonView comparison={compareScenarios(guidePlans())} />);

    expect(rowOf("Coste de personal por categoría", "Frontend Developer")[1]).toBe(
      "No está en este equipo-30.413,71 €",
    );
  });

  it("warns that a small category's cost may reveal a salary (rule j)", () => {
    const small = { smallCategories: [{ categoryId: "devops", activePeople: 1 as const }] };
    renderWithIntl(
      <ComparisonView
        comparison={compareScenarios([
          compared("A", planView("Plan A", PLAN_A, small)),
          compared("B", planView("Plan B", PLAN_B, small)),
        ])}
      />,
    );
    const table = screen.getByRole("table", { name: "Coste de personal por categoría" });

    expect(within(table).getByRole("rowheader", { name: /DevOps Engineer/ })).toHaveTextContent(
      "Categoría pequeña: su coste puede revelar un salario",
    );
    expect(within(table).getByRole("rowheader", { name: "Project Manager" })).toBeInTheDocument();
  });

  it("gives no difference for an undetermined figure and says which column lacks it", () => {
    renderWithIntl(
      <ComparisonView comparison={compareScenarios(guidePlans({ unrated: ["junior"] }))} />,
    );

    expect(rowOf("Resultado", "Coste de personal")[1]).toBe(
      "PendienteFalta el coste de Junior DeveloperSin diferencia: falta la cifra de Plan B",
    );
    expect(rowOf("Resultado", "Estado del margen")[1]).toBe("Sin estado");
  });

  it("shows who enters and leaves for everyone, and no money without rate access", async () => {
    const plans = guidePlans().map(({ id, frozen, view }) =>
      compared(id, withoutRateAccess(view), frozen),
    );
    const { container } = renderWithIntl(<ComparisonView comparison={compareScenarios(plans)} />);

    expect(screen.queryByRole("table", { name: "Resultado" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/€/);
    expect(screen.queryByText(/Valores congelados/)).not.toBeInTheDocument();
    expect(rowOf("Personas", "Person junior-1")[1]).toMatch(/Entra$/);
    expect(rowOf("Personas", "Person frontend-1")[1]).toBe("No está en este equipoSale");
    expect(rowOf("Horas", "Horas efectivas")[2]).toBe("2031,25 h-406,25 h");
    await expectNoAxeViolations();
  });

  it("has no axe violations with rate access", async () => {
    renderWithIntl(
      <ComparisonView comparison={compareScenarios(guidePlans({ unrated: ["junior"] }))} />,
    );
    await expectNoAxeViolations();
  });
});
