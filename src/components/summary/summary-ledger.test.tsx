import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Ledger, TeamSummary } from "@/lib/summary/summary";
import { renderWithIntl } from "@/test/render";

import { SummaryLedger } from "./summary-ledger";

// docs/design/canvas-brief.md, "4. Summary" and "States".

const complete: Ledger = {
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

  it("shows no status without revenue, and says why the margin % does not apply", () => {
    const ledger: Ledger = {
      ...complete,
      headline: {
        ...complete.headline,
        netMarginBasisPoints: { state: "notApplicable", reason: "noRevenue" },
        status: null,
      },
      lines: complete.lines.map((line) =>
        line.key === "directMargin" || line.key === "netMargin"
          ? { ...line, basisPoints: { state: "notApplicable", reason: "noRevenue" } }
          : line,
      ),
      figures: {
        ...complete.figures,
        effectiveRateCents: { state: "notApplicable", reason: "noEffectiveHours" },
      },
    };
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} />);

    const headline = section("Margen neto");
    expect(within(headline).queryByText(/objetivo$|Pérdidas/)).not.toBeInTheDocument();
    expect(plain(headline)).toContain("54.300 €");
    expect(plain(headline)).toContain("Margen % no aplicable. Sin ingresos");
    const margins = within(section("Desglose")).getAllByRole("row").slice(-2).map(plain);
    expect(margins).toEqual([
      "Margen directo73.500 € (% no aplicable)",
      "Margen neto54.300 € (% no aplicable)",
    ]);
    const figures = within(section("Cifras clave"));
    expect(plain(figures.getByText("Tarifa efectiva").nextElementSibling!)).toBe(
      "No aplicable Sin horas efectivas",
    );
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
    const ledger: Ledger = {
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

  describe("with a partial result", () => {
    const missing = (categories: string[], price = false) =>
      ({ state: "undetermined", missing: { categories, price } }) as const;
    const noRates = missing(["DevOps Engineer", "Project Manager"]);
    const all = missing(["DevOps Engineer", "Project Manager"], true);
    // DevOps and the PM without a rate, and no price: the senior's line and the extra cost keep
    // their amounts, as the engine computes them.
    const partial: Ledger = {
      ...complete,
      headline: {
        ...complete.headline,
        netMarginCents: all,
        netMarginBasisPoints: all,
        status: null,
      },
      figures: {
        ...complete.figures,
        revenueCents: missing([], true),
        totalCostCents: noRates,
        effectiveRateCents: missing([], true),
      },
      lines: [
        { key: "staffCost", cents: noRates, effectiveHours: 1983.27 },
        { key: "extraCost", id: "cloud", label: "Cloud", kind: "recurring", cents: 600_000 },
        { key: "directCost", cents: noRates },
        { key: "overhead", cents: noRates, basisPoints: 1500 },
        { key: "buffer", cents: noRates, basisPoints: 1000 },
        { key: "totalCost", cents: noRates },
        { key: "revenue", cents: missing([], true) },
        { key: "directMargin", cents: all, basisPoints: all },
        { key: "netMargin", cents: all, basisPoints: all },
      ],
      categories: [
        complete.categories[0]!,
        {
          ...complete.categories[1]!,
          costPerHourCents: missing(["DevOps Engineer"]),
          costCents: missing(["DevOps Engineer"]),
        },
      ],
      warnings: [
        { code: "missingRate", categories: ["DevOps Engineer", "Project Manager"] },
        { code: "missingPrice" },
      ],
    };

    it("says the net margin is undetermined and what it misses, with no status", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} />);

      const headline = section("Margen neto");
      expect(plain(headline)).toContain(
        "Indeterminado Sin tarifa: DevOps Engineer y Project Manager. Sin precio",
      );
      expect(within(headline).queryByText(/En objetivo|Bajo objetivo|Pérdidas/)).toBeNull();
      expect(plain(headline)).toContain("objetivo 25 %");
      expect(plain(headline)).not.toContain("€");
    });

    it("keeps the determined lines and names what each other line misses, never 0 €", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} />);

      const figures = within(section("Cifras clave"));
      const value = (term: string) => plain(figures.getByText(term).nextElementSibling!);
      expect(value("Ingresos")).toBe("Indeterminado Sin precio");
      expect(value("Coste total")).toBe(
        "Indeterminado Sin tarifa: DevOps Engineer y Project Manager",
      );
      expect(value("Tarifa efectiva")).toBe("Indeterminado Sin precio");
      const rows = within(section("Desglose"))
        .getAllByRole("row")
        .map((row) => plain(row));
      const rates = "Indeterminado Sin tarifa: DevOps Engineer y Project Manager";
      expect(rows).toEqual([
        `Coste de personal (1983,27 h efectivas)${rates}`,
        "Cloud6000 €",
        `Coste directo${rates}`,
        `Overhead (15 %)${rates}`,
        `Buffer (10 %)${rates}`,
        `Coste total${rates}`,
        "IngresosIndeterminado Sin precio",
        `Margen directo${rates}. Sin precio`,
        `Margen neto${rates}. Sin precio`,
      ]);
      expect(plain(section("Desglose"))).not.toMatch(/\b0 €/);
    });

    it("leaves a category without a rate undetermined, the others with their cost", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} />);

      const table = screen.getByRole("table", { name: "Coste de personal por categoría" });
      const groups = within(table).getAllByRole("rowgroup").slice(1);
      const rows = (group: HTMLElement) => within(group).getAllByRole("row").map(plain);
      expect(rows(groups[0]!)).toEqual(["Senior Developer", "1190 h45,88 €59.200 €"]);
      expect(rows(groups[1]!)).toEqual([
        "DevOps Engineer",
        "Categoría pequeña: su tarifa puede revelar un salario",
        "396,62 hIndeterminado Sin tarifa",
      ]);
    });

    it("warns about each missing rate and the missing price", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} />);

      expect(screen.getByRole("heading", { name: "Falta una tarifa" })).toBeVisible();
      expect(
        screen.getByText(
          "DevOps Engineer y Project Manager no tienen tarifa: su coste y lo que depende de él quedan indeterminados.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Falta el precio" })).toBeVisible();
    });

    it("speaks English under /en", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} />, { locale: "en" });

      expect(plain(section("Net margin"))).toContain(
        "Undetermined No rate: DevOps Engineer and Project Manager. No price",
      );
    });
  });

  it("speaks English under /en", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} />, { locale: "en" });

    expect(within(section("Net margin")).getByText("On target")).toBeInTheDocument();
    expect(plain(section("Net margin"))).toContain("€54,300");
  });
});
