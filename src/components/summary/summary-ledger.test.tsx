import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Ledger, TeamSummary } from "@/lib/summary/summary";
import userEvent from "@testing-library/user-event";

import { expectNoAxeViolations } from "@/test/axe";
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
    { key: "revenue", cents: 15_000_000 },
    { key: "staffCost", cents: 7_000_000, effectiveHours: 1983.27 },
    { key: "extraCost", id: "cloud", label: "Cloud", kind: "recurring", cents: 600_000 },
    { key: "extraCost", id: "licence", label: null, kind: "fixed", cents: 50_000 },
    { key: "directCost", cents: 7_650_000 },
    { key: "directMargin", cents: 7_350_000, basisPoints: 4900 },
    { key: "overhead", cents: 1_050_000, basisPoints: 1500 },
    { key: "buffer", cents: 870_000, basisPoints: 1000 },
    { key: "totalCost", cents: 9_570_000 },
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
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />);

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
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} pricingModel="fixed" />);

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
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} pricingModel="fixed" />);

    const headline = section("Margen neto");
    expect(within(headline).queryByText(/objetivo$|Pérdidas/)).not.toBeInTheDocument();
    expect(plain(headline)).toContain("54.300 €");
    expect(plain(headline)).toContain("Margen % no aplicable. Sin ingresos");
    const statement = within(section("Cuenta de resultados"));
    const row = (name: string) => plain(statement.getByRole("rowheader", { name }).parentElement!);
    expect(row("Margen directo")).toBe("Margen directo73.500 € · % no aplicable");
    expect(row("Margen neto")).toBe("Margen neto54.300 € · % no aplicable");
    const figures = within(section("Cifras clave"));
    expect(plain(figures.getByText("Tarifa efectiva").nextElementSibling!)).toBe(
      "No aplicable Sin horas efectivas",
    );
  });

  it("says the result is complete, counting its lines", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />);

    expect(screen.getByRole("heading", { level: 2, name: "Resultado" })).toBeVisible();
    expect(screen.getByText("Completo · 10 de 10 líneas")).toBeVisible();
  });

  it("splits revenue in a bar, and says the split in words", () => {
    const { container } = renderWithIntl(
      <SummaryLedger ledger={complete} team={team} pricingModel="fixed" />,
    );

    const part = (name: string) => container.querySelector<HTMLElement>(`[data-part="${name}"]`);
    expect(part("cost")?.style.width).toBe("63.8%");
    expect(part("margin")?.style.width).toBe("36.2%");
    expect(part("target")?.style.left).toBe("75%");
    expect(part("cost")?.parentElement).toHaveAttribute("aria-hidden");
    const headline = plain(section("Margen neto"));
    expect(headline).toContain("Coste total 63,8 %");
    expect(headline).toContain("Objetivo 25 %");
    expect(headline).toContain("Margen 36,2 %");
  });

  it("marks no target below nothing, though the legend says it", () => {
    const ledger: Ledger = {
      ...complete,
      headline: { ...complete.headline, targetMarginBasisPoints: -500 },
    };
    const { container } = renderWithIntl(
      <SummaryLedger ledger={ledger} team={team} pricingModel="fixed" />,
    );

    expect(container.querySelector('[data-part="target"]')).toBeNull();
    expect(plain(section("Margen neto"))).toContain("Objetivo -5 %");
  });

  it("draws a loss as a bar of cost only", () => {
    const ledger: Ledger = {
      ...complete,
      headline: {
        ...complete.headline,
        netMarginCents: -500_000,
        netMarginBasisPoints: -333,
        status: "red",
      },
    };
    const { container } = renderWithIntl(
      <SummaryLedger ledger={ledger} team={team} pricingModel="fixed" />,
    );

    expect(container.querySelector<HTMLElement>('[data-part="cost"]')?.style.width).toBe("100%");
    expect(container.querySelector('[data-part="margin"]')).toBeNull();
    expect(plain(section("Margen neto"))).toContain("Coste total 103,3 %");
  });

  it("gives the effective rate, the effective hours and the team as key figures", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />);

    const figures = within(section("Cifras clave"));
    const value = (term: string) => plain(figures.getByText(term).nextElementSibling!);
    expect(value("Tarifa efectiva")).toBe("75,63 €/h");
    expect(value("Horas efectivas")).toBe("1983,27 h");
    expect(value("Equipo")).toBe("3 + 1 vacante");
  });

  it.each([
    [{ people: 3, openRoles: 0 }, "3 personas"],
    [{ people: 1, openRoles: 2 }, "1 + 2 vacantes"],
  ])("counts a team of %o as «%s»", (counts, words) => {
    renderWithIntl(<SummaryLedger ledger={complete} team={counts} pricingModel="fixed" />);

    const figures = within(section("Cifras clave"));
    expect(plain(figures.getByText("Equipo").nextElementSibling!)).toBe(words);
  });

  it("reads the result lines as a statement, with hints and subtotals", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />);

    const rows = within(section("Cuenta de resultados"))
      .getAllByRole("row")
      .map((row) => plain(row));
    expect(rows).toEqual([
      "Ingresos · precio cerrado150.000 €",
      "Coste de personal · 1983,27 h70.000 €",
      "Cloud · coste extra mensual6000 €",
      "Coste extra fijo500 €",
      "Subtotal Coste directo76.500 €",
      "Margen directo73.500 € · 49 %",
      "Overhead · 15 %10.500 €",
      "Buffer · 10 %8700 €",
      "Subtotal Coste total95.700 €",
      "Margen neto54.300 € · 36,2 %",
    ]);
  });

  it("explains each term of the statement and the figures in an «i», but not extra costs", async () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />);

    const named = screen
      .getAllByRole("button", { name: /^Qué es: / })
      .map((button) => button.getAttribute("aria-label"));
    expect(named).toEqual([
      "Qué es: Margen neto",
      "Qué es: Tarifa efectiva",
      "Qué es: Horas efectivas",
      "Qué es: Ingresos",
      "Qué es: Coste de personal",
      "Qué es: Coste directo",
      "Qué es: Margen directo",
      "Qué es: Overhead",
      "Qué es: Buffer",
      "Qué es: Coste total",
      "Qué es: Margen neto",
    ]);

    // A row's name is its line and hint, never the "i", which a screen reader would repeat.
    expect(screen.getByRole("rowheader", { name: /^Overhead\s15\s%$/ })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: "Subtotal Coste total" })).toBeVisible();

    await userEvent.hover(screen.getByRole("button", { name: "Qué es: Overhead" }));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Se reparten como un porcentaje del coste de personal.");
    expect(tip).toHaveTextContent("overhead % × coste de personal");
    await expectNoAxeViolations();
  });

  it("says how time-and-materials revenue is made", () => {
    renderWithIntl(
      <SummaryLedger ledger={complete} team={team} pricingModel="time_and_materials" />,
    );

    const rows = within(section("Cuenta de resultados")).getAllByRole("row");
    expect(plain(rows[0]!)).toBe("Ingresos · tiempo y materiales150.000 €");
  });

  it("folds each category's hours, cost per hour and cost, warning on a small one", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />);

    const details = screen.getByText("Coste de personal por categoría (2)").closest("details");
    expect(details).not.toHaveAttribute("open");
    const table = screen.getByRole("table", {
      name: "Coste de personal por categoría",
      hidden: true,
    });
    const rows = within(table).getAllByRole("row", { hidden: true }).map(plain);
    expect(rows).toEqual([
      "CategoríaHoras efectivasCoste/horaCoste",
      "Senior Developer1190 h45,88 €59.200 €",
      // The cost is still shown (rule j is a warning, not a block), its warning on a row of its own.
      "DevOps Engineer396,62 h44,19 €10.800 €",
      "Categoría pequeña: su coste puede revelar un salario",
    ]);
  });

  it("warns when revenue goes over the T&M budget cap", () => {
    const ledger: Ledger = {
      ...complete,
      warnings: [
        { code: "budgetCapExceeded", revenueCents: 15_000_000, budgetCapCents: 12_000_000 },
      ],
    };
    renderWithIntl(<SummaryLedger ledger={ledger} team={team} pricingModel="fixed" />);

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
    const missing = (
      categories: string[],
      price = false,
      rates: "cost" | "sellRate" | "both" = "cost",
    ) => ({ state: "undetermined", missing: { categories, rates, price } }) as const;
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
        { key: "revenue", cents: missing([], true) },
        { key: "staffCost", cents: noRates, effectiveHours: 1983.27 },
        { key: "extraCost", id: "cloud", label: "Cloud", kind: "recurring", cents: 600_000 },
        { key: "directCost", cents: noRates },
        { key: "directMargin", cents: all, basisPoints: all },
        { key: "overhead", cents: noRates, basisPoints: 1500 },
        { key: "buffer", cents: noRates, basisPoints: 1000 },
        { key: "totalCost", cents: noRates },
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
        {
          code: "missingRate",
          categories: ["DevOps Engineer", "Project Manager"],
          sellRates: false,
        },
        { code: "missingPrice" },
      ],
    };
    // Time and materials: revenue is hours times sell rate, so it misses the sell rates, and the
    // margins miss both; there is no price to miss.
    const names = ["DevOps Engineer", "Project Manager"];
    const timeAndMaterials: Ledger = {
      ...partial,
      headline: {
        ...partial.headline,
        netMarginCents: missing(names, false, "both"),
        netMarginBasisPoints: missing(names, false, "both"),
      },
      figures: {
        ...partial.figures,
        revenueCents: missing(names, false, "sellRate"),
        effectiveRateCents: missing(names, false, "sellRate"),
      },
      lines: partial.lines.map((line) =>
        line.key === "revenue" ? { ...line, cents: missing(names, false, "sellRate") } : line,
      ),
      warnings: [{ code: "missingRate", categories: names, sellRates: true }],
    };

    it("says the net margin is undetermined and what it misses, with no status", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} pricingModel="fixed" />);

      const headline = section("Margen neto");
      expect(within(headline).getByText("Pendiente")).toBeVisible();
      expect(
        within(headline).getByText(
          "Faltan los costes de DevOps Engineer y Project Manager. Falta el precio",
        ),
      ).toBeVisible();
      expect(within(headline).queryByText(/En objetivo|Bajo objetivo|Pérdidas/)).toBeNull();
      expect(plain(headline)).toContain("objetivo 25 %");
      expect(plain(headline)).not.toContain("€");
    });

    it("keeps the determined lines and names what each other line misses, never 0 €", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} pricingModel="fixed" />);

      const figures = within(section("Cifras clave"));
      const value = (term: string) => plain(figures.getByText(term).nextElementSibling!);
      expect(value("Tarifa efectiva")).toBe("Pendiente Falta el precio");
      expect(screen.getByText("Parcial · 1 de 9 líneas")).toBeVisible();
      const rows = within(section("Cuenta de resultados"))
        .getAllByRole("row")
        .map((row) => plain(row));
      const rates = "Pendiente Faltan los costes de DevOps Engineer y Project Manager";
      expect(rows).toEqual([
        "Ingresos · precio cerradoPendiente Falta el precio",
        `Coste de personal · 1983,27 h${rates}`,
        "Cloud · coste extra mensual6000 €",
        `Subtotal Coste directo${rates}`,
        `Margen directo${rates}. Falta el precio`,
        `Overhead · 15 %${rates}`,
        `Buffer · 10 %${rates}`,
        `Subtotal Coste total${rates}`,
        `Margen neto${rates}. Falta el precio`,
      ]);
      expect(plain(section("Cuenta de resultados"))).not.toMatch(/\b0 €/);
    });

    it("leaves a category without a rate undetermined, the others with their cost", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} pricingModel="fixed" />);

      const table = screen.getByRole("table", {
        name: "Coste de personal por categoría",
        hidden: true,
      });
      const rows = within(table).getAllByRole("row", { hidden: true }).map(plain).slice(1);
      expect(rows).toEqual([
        "Senior Developer1190 h45,88 €59.200 €",
        "DevOps Engineer396,62 hPendiente Falta el coste",
        "Categoría pequeña: su coste puede revelar un salario",
      ]);
    });

    it("warns about each missing rate and the missing price", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} pricingModel="fixed" />);

      expect(screen.getByRole("heading", { name: "Falta un coste" })).toBeVisible();
      expect(
        screen.getByText(
          "Faltan los costes de DevOps Engineer y Project Manager: su coste de personal y lo que depende de él quedan pendientes.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Falta el precio" })).toBeVisible();
    });

    it("says time-and-materials revenue misses the sell rate, and its margins both", () => {
      renderWithIntl(
        <SummaryLedger ledger={timeAndMaterials} team={team} pricingModel="time_and_materials" />,
      );

      expect(
        within(section("Margen neto")).getByText(
          "Faltan los costes y las tarifas de venta de DevOps Engineer y Project Manager",
        ),
      ).toBeVisible();
      const statement = within(section("Cuenta de resultados"));
      const row = (name: string) =>
        plain(statement.getByRole("rowheader", { name: new RegExp(name) }).parentElement!);
      expect(row("Ingresos")).toBe(
        "Ingresos · tiempo y materialesPendiente Faltan las tarifas de venta de DevOps Engineer y Project Manager",
      );
      expect(
        screen.getByRole("heading", { name: "Faltan un coste y una tarifa de venta" }),
      ).toBeVisible();
      expect(
        screen.getByText(
          "Faltan los costes y las tarifas de venta de DevOps Engineer y Project Manager: el coste de personal, los ingresos y lo que depende de ellos quedan pendientes.",
        ),
      ).toBeInTheDocument();
    });

    it("speaks English under /en", () => {
      renderWithIntl(<SummaryLedger ledger={partial} team={team} pricingModel="fixed" />, {
        locale: "en",
      });

      expect(within(section("Net margin")).getByText("Pending")).toBeVisible();
      expect(
        within(section("Net margin")).getByText(
          "Missing the costs of DevOps Engineer and Project Manager. Missing the price",
        ),
      ).toBeVisible();
    });
  });

  it("speaks English under /en", () => {
    renderWithIntl(<SummaryLedger ledger={complete} team={team} pricingModel="fixed" />, {
      locale: "en",
    });

    expect(within(section("Net margin")).getByText("On target")).toBeInTheDocument();
    expect(plain(section("Net margin"))).toContain("€54,300");
  });
});
