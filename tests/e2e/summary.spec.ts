import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). Plan A is the
// guide case team, costed with the 2027 calendar (docs/domain.md, "Configuration per
// organization"), so its figures differ slightly from the guide case's.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const rail = (page: Page) => page.getByRole("complementary", { name: "Resumen" });
const region = (page: Page, name: string) => rail(page).getByRole("region", { name });
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
