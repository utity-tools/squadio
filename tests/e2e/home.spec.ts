import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home page introduces Squadio", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Squadio");
  await expect(page.getByRole("heading", { level: 1, name: "Squadio" })).toBeVisible();
});

test("home page has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
