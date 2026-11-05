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
    .filter({ has: page.getByRole("heading", { level: 3, name: title }) });
/** Intl separates figures from their units with no-break spaces. */
const figure = (text: string) => new RegExp(text.replaceAll(" ", "[\\s\\u00a0\\u202f]"));
/** Staff cost by category is folded under its count: open it to read it. */
async function categoryTable(page: Page) {
  await rail(page)
    .getByText(/^Coste de personal por categoría \(\d+\)$/)
    .click();
  return rail(page).getByRole("table", { name: "Coste de personal por categoría" });
}

test("the rail leads with the net margin, its status and the key figures", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  const headline = region(page, "Margen neto");
  await expect(headline).toContainText(figure("63.356 €"));
  await expect(headline).toContainText(figure("31,7 %"));
  await expect(headline.getByText("En objetivo")).toBeVisible();
  await expect(headline).toContainText(figure("objetivo 25 %"));
  await expect(headline).toContainText(figure("Coste total 68,3 %"));
  await expect(rail(page).getByText("Completo · 9 de 9 líneas")).toBeVisible();

  const figures = region(page, "Cifras clave").getByRole("definition");
  await expect(figures).toHaveText([figure("84,04 €/h"), figure("2379,92 h"), "3 + 1 vacante"]);
});

test("the rail lists the result lines and staff cost by category", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  const lines = region(page, "Cuenta de resultados").getByRole("rowheader");
  await expect(lines).toHaveText([
    "Ingresos · precio cerrado",
    figure("Coste de personal · 2379,92 h"),
    "Cloud · coste extra mensual",
    "Subtotal Coste directo",
    "Margen directo",
    figure("Overhead · 15 %"),
    figure("Buffer · 10 %"),
    "Subtotal Coste total",
    "Margen neto",
  ]);

  const categories = await categoryTable(page);
  await expect(categories.getByRole("rowheader")).toHaveText([
    "Project Manager",
    "Senior Developer",
    "Frontend Developer",
    "DevOps Engineer",
  ]);
  // DevOps has two active people: its rate reveals a salary (rule j).
  await expect(
    categories.getByRole("row").filter({ hasText: "DevOps Engineer" }).locator("+ tr"),
  ).toHaveText("Categoría pequeña: su coste puede revelar un salario");
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
  await expect(headline).not.toContainText("Pendiente");
  await expect(headline.getByText(/^(En objetivo|Bajo objetivo|Pérdidas)$/)).toBeVisible();
  await expect(
    region(page, "Cuenta de resultados").getByRole("row").filter({ hasText: "Ingresos" }),
  ).toContainText(figure("51.565 €"));
});

test("without a category's rate the rail keeps every line it can and names what is missing", async ({
  page,
}) => {
  await page.goto(`/scenarios/${MISSING_RATE_SCENARIO}`);

  // Time and materials: the category's rate holds its sell rate too, so revenue misses it as well.
  const card = warning(page, "Faltan un coste y una tarifa de venta");
  await expect(card).toContainText(
    "Faltan el coste y la tarifa de venta de Data Engineer: el coste de personal, los ingresos y lo que depende de ellos quedan pendientes.",
  );
  await expect(card).toHaveClass(/border-status-warn/);
  // T&M: the revenue needs the rate too, so the budget cap is not judged (rule e).
  await expect(rail(page).getByRole("listitem")).toHaveCount(1);

  const headline = region(page, "Margen neto");
  await expect(headline.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(
    headline.getByText("Faltan el coste y la tarifa de venta de Data Engineer"),
  ).toBeVisible();
  await expect(rail(page).getByText("Parcial · 0 de 8 líneas")).toBeVisible();
  await expect(headline.getByText(/^(En objetivo|Bajo objetivo|Pérdidas)$/)).toHaveCount(0);
  await expect(headline).not.toContainText("€");

  const figures = region(page, "Cifras clave").getByRole("definition");
  await expect(figures).toHaveText([
    "Pendiente Falta la tarifa de venta de Data Engineer",
    // A senior full time and the Data Engineer at half: 1.5 full-time seats, half of Plan A's three.
    figure("1189,96 h"),
    "1 + 1 vacante",
  ]);

  // Screen readers hear the state and what is missing as separate words.
  await expect(figures.first()).toMatchAriaSnapshot(
    `- definition: "Pendiente Falta la tarifa de venta de Data Engineer"`,
  );

  // The senior's line keeps its cost; the Data Engineer's says it has no rate.
  const categories = await categoryTable(page);
  const group = (name: string) => categories.getByRole("row").filter({ hasText: name });
  await expect(group("Senior Developer")).toContainText(figure("\\d[\\d.]* €"));
  await expect(group("Data Engineer")).toContainText("Pendiente Falta el coste");
  await expect(group("Data Engineer")).not.toContainText("€");
  await expect(
    region(page, "Cuenta de resultados").getByRole("row").filter({ hasText: "Coste de personal" }),
  ).toContainText("Pendiente Falta el coste de Data Engineer");
});

test("without a fixed price the rail keeps every cost and leaves revenue and margin undetermined", async ({
  page,
}) => {
  await page.goto(`/scenarios/${MISSING_PRICE_SCENARIO}`);

  const card = warning(page, "Falta el precio");
  await expect(card).toContainText(
    "El proyecto es de precio cerrado y no tiene precio: los ingresos, el margen y lo que depende de ellos quedan pendientes.",
  );
  await expect(rail(page).getByRole("listitem")).toHaveCount(1);
  await expect(region(page, "Margen neto").getByText("Falta el precio")).toBeVisible();

  const figures = region(page, "Cifras clave").getByRole("definition");
  await expect(figures.first()).toHaveText("Pendiente Falta el precio");
  await expect(figures.nth(1)).toHaveText(figure("793,31 h"));
  const lines = region(page, "Cuenta de resultados").getByRole("row");
  await expect(lines.filter({ hasText: "Coste total" })).toContainText(figure("24.842 €"));
  await expect(lines.filter({ hasText: "Ingresos" })).toContainText("Pendiente Falta el precio");
  await expect(lines.filter({ hasText: "Margen neto" })).toContainText("Pendiente Falta el precio");
});

test("the warnings speak English under /en", async ({ page }) => {
  const summary = (page: Page) => page.getByRole("complementary", { name: "Summary" });

  await page.goto(`/en/scenarios/${OVER_BUDGET_SCENARIO}`);
  await expect(
    summary(page).getByRole("listitem").filter({ hasText: "Budget cap exceeded" }),
  ).toContainText(figure("Revenue, €51,565, is over the cap of €50,000."));

  await page.goto(`/en/scenarios/${MISSING_RATE_SCENARIO}`);
  await expect(
    summary(page).getByRole("listitem").filter({ hasText: "A cost and a sell rate are missing" }),
  ).toContainText(
    "Missing the cost and sell rate of Data Engineer: staff cost, revenue and what depends on them are pending.",
  );
  await expect(
    summary(page).getByRole("region", { name: "Key figures" }).getByRole("definition").first(),
  ).toHaveText("Pending Missing the sell rate of Data Engineer");
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
      if (access === "full") {
        // With an info tip and staff cost by category open, so axe checks them too.
        await categoryTable(page);
        await rail(page).getByRole("button", { name: "Qué es: Overhead" }).click();
        await expect(page.getByRole("dialog", { name: "Overhead" })).toBeVisible();
      }
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      await expectNoAxeViolations(page);
    });
  }
}
