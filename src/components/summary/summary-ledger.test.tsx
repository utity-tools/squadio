import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Ledger, TeamSummary } from "@/lib/summary/summary";
import { renderWithIntl } from "@/test/render";

import { SummaryLedger } from "./summary-ledger";

// docs/design/canvas-brief.md, "4. Summary" and "States".

type CompleteLedger = Extract<Ledger, { complete: true }>;

const complete: CompleteLedger = {
  complete: true,
  headline: {
    netMarginCents: 5_430_000,
    netMarginBasisPoints: 3620,
    status: "green",
    targetMarginBasisPoints: 2500,
  },
  figures: {
    revenueCents: 15_000_000,
    totalCostCents: 9_570_000,
    effectiveRateCents: 7563,
    effectiveHours: 1983.27,
  },
  lines: [
    { key: "staffCost", cents: 7_000_000, effectiveHours: 1983.27 },
    { key: "extraCost", id: "cloud", label: "Cloud", kind: "recurring", cents: 600_000 },
    { key: "extraCost", id: "licence", label: null, kind: "fixed", cents: 50_000 },
    { key: "directCost", cents: 7_650_000 },
    { key: "overhead", cents: 1_050_000, basisPoints: 1500 },
    { key: "buffer", cents: 870_000, basisPoints: 1000 },
    { key: "totalCost", cents: 9_570_000 },
    { key: "revenue", cents: 15_000_000 },
    { key: "directMargin", cents: 7_350_000, basisPoints: 4900 },
    { key: "netMargin", cents: 5_430_000, basisPoints: 3620 },
  ],
  categories: [
    {
      categoryId: "senior",
      name: "Senior Developer",
      effectiveHours: 1190,
      costPerHourCents: 4588,
      costCents: 5_920_000,
      activePeople: null,
    },
    {
      categoryId: "devops",
      name: "DevOps Engineer",
      effectiveHours: 396.62,
      costPerHourCents: 4419,
      costCents: 1_080_000,
      activePeople: 2,
    },
  ],
  warnings: [],
};

const team: TeamSummary = {
  people: 3,
  openRoles: 1,
  nominalHours: 2600,
  effectiveHours: 1983.27,
  span: { start: "2027-04-01", end: "2027-09-29", workingDays: 130 },
};

/** Text with Intl's no-break and narrow no-break spaces as plain spaces. */
const plain = (element: Element) => (element.textContent ?? "").replace(/[  ]/g, " ");

const section = (name: string) => screen.getByRole("region", { name });

describe("SummaryLedger", () => {
  it("leads with the net margin, its status as a word and the target", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} />);

    const headline = section("Margen neto");
    expect(plain(headline)).toContain("54.300 €");
    expect(plain(headline)).toContain("36,2 %");
    expect(within(headline).getByText("En objetivo")).toBeInTheDocument();
    expect(plain(headline)).toContain("objetivo 25 %");
  });

  it.each([
    ["amber", "Bajo objetivo"],
    ["red", "Pérdidas"],
  ] as const)("names the %s status in words", (status, word) => {
    const ledger = { ...complete, headline: { ...complete.headline, status } };
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} />);

    expect(within(section("Margen neto")).getByText(word)).toBeInTheDocument();
  });

  it("shows no status without one (no revenue)", () => {
    const ledger = {
      ...complete,
      headline: { ...complete.headline, netMarginBasisPoints: null, status: null },
    };
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} />);

    const headline = section("Margen neto");
    expect(within(headline).queryByText(/objetivo$|Pérdidas/)).not.toBeInTheDocument();
    expect(plain(headline)).toContain("54.300 €");
  });

  it("gives the key figures in whole euros, the rate in cents per hour", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} />);

    const figures = within(section("Cifras clave"));
    const value = (term: string) => plain(figures.getByText(term).nextElementSibling!);
    expect(value("Ingresos")).toBe("150.000 €");
    expect(value("Coste total")).toBe("95.700 €");
    expect(value("Tarifa efectiva")).toBe("75,63 €/h");
    expect(value("Horas efectivas")).toBe("1983,27 h");
    expect(plain(section("Cifras clave"))).toContain("3 personas");
    expect(plain(section("Cifras clave"))).toContain("1 vacante");
  });

  it("lists the result lines in order, naming extra costs and showing percentages", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} />);

    const rows = within(section("Desglose"))
      .getAllByRole("row")
      .map((row) => plain(row));
    expect(rows).toEqual([
      "Coste de personal (1983,27 h efectivas)70.000 €",
      "Cloud6000 €",
      "Coste extra fijo500 €",
      "Coste directo76.500 €",
      "Overhead (15 %)10.500 €",
      "Buffer (10 %)8700 €",
      "Coste total95.700 €",
      "Ingresos150.000 €",
      "Margen directo73.500 € (49 %)",
      "Margen neto54.300 € (36,2 %)",
    ]);
  });

  it("shows each category's hours, cost per hour and cost, warning on a small one", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} />);

    const table = screen.getByRole("table", { name: "Coste de personal por categoría" });
    const groups = within(table).getAllByRole("rowgroup").slice(1);
    const rows = (group: HTMLElement) => within(group).getAllByRole("row").map(plain);
    expect(rows(groups[0]!)).toEqual(["Senior Developer", "1190 h45,88 €59.200 €"]);
    expect(within(groups[0]!).getByRole("rowheader", { name: "Senior Developer" })).toBeVisible();
    // Rule j's warning has a row of its own, so it does not head each figure.
    expect(rows(groups[1]!)).toEqual([
      "DevOps Engineer",
      "Categoría pequeña: su tarifa puede revelar un salario",
      // The cost is still shown (rule j is a warning, not a block).
      "396,62 h44,19 €10.800 €",
    ]);
  });

  it("warns when revenue goes over the T&M budget cap", () => {
    const ledger: CompleteLedger = {
      ...complete,
      warnings: [
        { code: "budgetCapExceeded", revenueCents: 15_000_000, budgetCapCents: 12_000_000 },
      ],
    };
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} />);

    expect(screen.getByRole("heading", { name: "Tope de presupuesto superado" })).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          plain(element) === "Los ingresos, 150.000 €, superan el tope de 120.000 €.",
      ),
    ).toBeInTheDocument();
  });

  it("replaces every money figure of an incomplete scenario with a dash, never 0 €", () => {
    const { container } = renderWithIntl(
      <SummaryLedger
        ledger={{
          complete: false,
          effectiveHours: 1983.27,
          targetMarginBasisPoints: 2500,
          warnings: [
            { code: "missingRate", categories: ["DevOps Engineer", "Project Manager"] },
            { code: "missingPrice" },
          ],
        }}
        team={team}
      />,
    );

    expect(plain(container)).not.toContain("€");
    expect(screen.getByRole("heading", { name: "Falta una tarifa" })).toBeVisible();
    expect(
      screen.getByText(
        "DevOps Engineer y Project Manager no tienen tarifa, así que el escenario no tiene coste.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Falta el precio" })).toBeVisible();
    expect(
      within(section("Margen neto")).getByText("Sin margen: el escenario está incompleto"),
    ).toBeVisible();
    const figures = within(section("Cifras clave"));
    expect(figures.getAllByText("No disponible: el escenario está incompleto")).toHaveLength(3);
    expect(plain(figures.getByText("Horas efectivas").nextElementSibling!)).toBe("1983,27 h");
    expect(screen.queryByRole("region", { name: "Desglose" })).not.toBeInTheDocument();
  });

  it("speaks English under /en", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} />, { locale: "en" });

    expect(within(section("Net margin")).getByText("On target")).toBeInTheDocument();
    expect(plain(section("Net margin"))).toContain("€54,300");
  });
});
