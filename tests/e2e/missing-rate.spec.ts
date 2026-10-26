import { type Locator, type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). "Data platform"
// has a tech lead and an open Data Engineer role, a category without a rate (src/db/demo-seed.ts).
const MISSING_RATE_SCENARIO = "6d656d6f-0000-4000-8000-000000000203";

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
const node = (page: Page, title: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${title}\\s*,`) });
/** A body row, by the role in its first cell. */
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });
/** A card's flag in the streamed payload, whose quotes may come escaped. */
const MISSING_RATE_TRUE = /missingRate\\*"\s*:\s*true/;
const MISSING_RATE_FALSE = /missingRate\\*"\s*:\s*false/;
/** The marker: a warning icon beside the text, never the colour alone. */
const marker = (scope: Locator) =>
  scope.locator("[data-missing-rate]").filter({ hasText: "Sin tarifa" });

test("the tree marks the nodes whose category has no rate", async ({ page }) => {
  await page.goto(`/scenarios/${MISSING_RATE_SCENARIO}?view=tree`);

  const data = node(page, "Data engineer");
  await expect(data).toHaveAccessibleName(/Data Engineer\s*,\s*Sin tarifa\s*,/);
  await expect(marker(data)).toBeVisible();
  await expect(marker(data).locator("svg")).toHaveClass(/text-status-warn/);
  await expect(marker(node(page, "Tech lead"))).toHaveCount(0);
});

test("the table marks the rows whose category has no rate", async ({ page }) => {
  await page.goto(`/scenarios/${MISSING_RATE_SCENARIO}?view=table`);

  const data = row(page, "Data engineer");
  await expect(data).toContainText("Data Engineer");
  await expect(marker(data)).toBeVisible();
  await expect(marker(data).locator("svg")).toHaveClass(/text-status-warn/);
  await expect(marker(row(page, "Tech lead"))).toHaveCount(0);
});

test("the marker speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${MISSING_RATE_SCENARIO}?view=table`);

  const data = page
    .getByRole("treegrid", { name: "Team table" })
    .getByRole("row", { name: /^Data engineer\s/ });
  await expect(data.locator("[data-missing-rate]")).toHaveText("No rate");
});

for (const view of ["tree", "table"] as const) {
  test(`without rate access the ${view} marks nothing`, async ({ page }) => {
    const response = await page.goto(
      `/scenarios/${MISSING_RATE_SCENARIO}?access=none&view=${view}`,
    );

    const team = view === "tree" ? tree(page) : grid(page);
    await expect(team).toContainText("Data Engineer");
    await expect(page.locator("[data-missing-rate]")).toHaveCount(0);
    await expect(page.getByText("Sin tarifa")).toHaveCount(0);
    // Not hidden but absent: nothing in the HTML or its payload says which category lacks a rate.
    const html = (await response?.text()) ?? "";
    expect(html).toMatch(MISSING_RATE_FALSE);
    expect(html).not.toMatch(MISSING_RATE_TRUE);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the ${view} marker has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/scenarios/${MISSING_RATE_SCENARIO}?view=${view}`);
      await expect(page.locator("[data-missing-rate]").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      await expectNoAxeViolations(page);
    });
  }
}
