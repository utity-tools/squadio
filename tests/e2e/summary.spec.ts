import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). Plan A is the
// guide case team, costed with the 2027 calendar (docs/domain.md, "Configuration per
// organization"), so its figures differ slightly from the guide case's.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";
// One demo scenario per summary warning (src/db/demo-seed.ts).
const OVER_BUDGET_SCENARIO = "6d656d6f-0000-4000-8000-000000000202";
const MISSING_RATE_SCENARIO = "6d656d6f-0000-4000-8000-000000000203";
const MISSING_PRICE_SCENARIO = "6d656d6f-0000-4000-8000-000000000204";

const rail = (page: Page) => page.getByRole("complementary", { name: "Resumen" });
const region = (page: Page, name: string) => rail(page).getByRole("region", { name });
const warning = (page: Page, title: string) =>
  rail(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) });
/** Intl separates figures from their units with no-break spaces. */
const figure = (text: string) => new RegExp(text.replaceAll(" ", "[\\s\\u00a0\\u202f]"));

test("the rail leads with the net margin, its status and the key figures", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  const headline = region(page, "Margen neto");
  await expect(headline).toContainText(figure("63.356 €"));
  await expect(headline).toContainText(figure("31,7 %"));
  await expect(headline.getByText("En objetivo")).toBeVisible();
  await expect(headline).toContainText(figure("objetivo 25 %"));

  const figures = region(page, "Cifras clave");
  await expect(figures).toContainText(figure("200.000 €"));
  await expect(figures).toContainText(figure("136.644 €"));
  await expect(figures).toContainText(figure("84,04 €/h"));
  await expect(figures).toContainText(figure("2379,92 h"));
  await expect(figures).toContainText("3 personas · 1 vacante");
});

test("the rail lists the result lines and staff cost by category", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  const lines = region(page, "Desglose").getByRole("rowheader");
  await expect(lines).toHaveText([
    "Coste de personal (2379,92 h efectivas)",
    "Cloud",
    "Coste directo",
    figure("Overhead \\(15 %\\)"),
    figure("Buffer \\(10 %\\)"),
    "Coste total",
    "Ingresos",
    "Margen directo",
    "Margen neto",
  ]);

  const categories = rail(page).getByRole("table", { name: "Coste de personal por categoría" });
  await expect(categories.getByRole("rowheader")).toHaveText([
    "Project Manager",
    "Senior Developer",
    "Frontend Developer",
    "DevOps Engineer",
  ]);
  // DevOps has two active people: its rate reveals a salary (rule j).
  const devOps = categories.getByRole("rowgroup").filter({ hasText: "DevOps Engineer" });
  await expect(devOps).toContainText("Categoría pequeña: su tarifa puede revelar un salario");
});

test("without rate access the page shows team and hours and sends no money", async ({ page }) => {
  const response = await page.goto(`/scenarios/${GUIDE_SCENARIO}?access=none`);

  const team = region(page, "Equipo y horas");
  await expect(team).toContainText(figure("3120 h"));
  await expect(team).toContainText(figure("2379,92 h"));
  await expect(
    team.getByText("Los costes y márgenes los ven las personas con acceso a tarifas."),
  ).toBeVisible();
  await expect(region(page, "Margen neto")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("€");
  // Not hidden but absent: the HTML and its streamed payload carry no result line (ADR 0005).
  const html = (await response?.text()) ?? "";
  expect(html).not.toContain("netMarginCents");
  expect(html).not.toContain("staffCostByCategory");
  expect(html).not.toContain("€");
  expect(html).not.toContain("63.356");
});

test("the rail speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${GUIDE_SCENARIO}`);

  const headline = page
    .getByRole("complementary", { name: "Summary" })
    .getByRole("region", { name: "Net margin" });
  await expect(headline.getByText("On target")).toBeVisible();
  await expect(headline).toContainText(figure("€63,356"));
});

test("a T&M scenario above its budget cap warns and keeps its margin", async ({ page }) => {
  await page.goto(`/scenarios/${OVER_BUDGET_SCENARIO}`);

  const card = warning(page, "Tope de presupuesto superado");
  await expect(card).toContainText(figure("Los ingresos, 51.565 €, superan el tope de 50.000 €."));
  await expect(card).toHaveClass(/border-status-warn/);
  await expect(rail(page).getByRole("listitem")).toHaveCount(1);
  // The cap is a warning, not the margin's status: the headline keeps its figure and status.
  const headline = region(page, "Margen neto");
  await expect(headline).not.toContainText("Sin margen");
  await expect(headline.getByText(/^(En objetivo|Bajo objetivo|Pérdidas)$/)).toBeVisible();
  await expect(region(page, "Cifras clave")).toContainText(figure("51.565 €"));
  await expect(region(page, "Desglose")).toBeVisible();
});

for (const { what, scenario, title, description, hours } of [
  {
    what: "a category without a rate",
    scenario: MISSING_RATE_SCENARIO,
    title: "Falta una tarifa",
    description: "Data Engineer no tiene tarifa, así que el escenario no tiene coste.",
    // A senior full time and the Data Engineer at half: 1.5 full-time seats, half of Plan A's three.
    hours: "1189,96 h",
  },
  {
    what: "a fixed-price project without a price",
    scenario: MISSING_PRICE_SCENARIO,
    title: "Falta el precio",
    description:
      "El proyecto es de precio cerrado y no tiene precio, así que el escenario no tiene ingresos ni margen.",
    hours: "793,31 h",
  },
]) {
  test(`a scenario with ${what} warns and shows no money figure`, async ({ page }) => {
    await page.goto(`/scenarios/${scenario}`);

    const card = warning(page, title);
    await expect(card).toContainText(description);
    await expect(card).toHaveClass(/border-status-warn/);
    await expect(rail(page).getByRole("listitem")).toHaveCount(1);
    await expect(region(page, "Margen neto")).toContainText(
      "Sin margen: el escenario está incompleto",
    );

    // Revenue, total cost and the effective rate show a dash, and screen readers hear the reason
    // instead of the dash.
    const figures = region(page, "Cifras clave").getByRole("definition");
    for (const n of [0, 1, 2]) {
      const value = figures.nth(n);
      await expect(value).toContainText("—");
      await expect(value).toMatchAriaSnapshot(
        `- definition: "No disponible: el escenario está incompleto"`,
      );
    }
    // The hours need no rate or price.
    await expect(figures.nth(3)).toHaveText(figure(hours));
    await expect(region(page, "Desglose")).toHaveCount(0);
    await expect(rail(page).getByRole("table")).toHaveCount(0);
  });
}

test("the warnings speak English under /en", async ({ page }) => {
  const summary = (page: Page) => page.getByRole("complementary", { name: "Summary" });

  await page.goto(`/en/scenarios/${OVER_BUDGET_SCENARIO}`);
  await expect(
    summary(page).getByRole("listitem").filter({ hasText: "Budget cap exceeded" }),
  ).toContainText(figure("Revenue, €51,565, is over the cap of €50,000."));

  await page.goto(`/en/scenarios/${MISSING_RATE_SCENARIO}`);
  await expect(
    summary(page).getByRole("listitem").filter({ hasText: "A rate is missing" }),
  ).toContainText("Data Engineer has no rate, so the scenario has no cost.");
  await expect(
    summary(page).getByRole("region", { name: "Key figures" }).getByRole("definition").first(),
  ).toMatchAriaSnapshot(`- definition: "Not available: the scenario is incomplete"`);
});

for (const [warned, scenario] of [
  ["budget cap", OVER_BUDGET_SCENARIO],
  ["missing rate", MISSING_RATE_SCENARIO],
  ["missing price", MISSING_PRICE_SCENARIO],
] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the ${warned} warning has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/scenarios/${scenario}`);
      await expect(rail(page).getByRole("listitem").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      await expectNoAxeViolations(page);
    });
  }
}

for (const access of ["full", "none"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the rail has no accessibility violations with ${access} access in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/scenarios/${GUIDE_SCENARIO}${access === "none" ? "?access=none" : ""}`);
      await expect(
        region(page, access === "none" ? "Equipo y horas" : "Margen neto"),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      await expectNoAxeViolations(page);
    });
  }
}
