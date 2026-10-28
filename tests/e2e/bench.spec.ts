import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). The bench shows
// from `xl`; Playwright's desktop viewport is 1280 px wide. Occupancy depends on the day the test
// runs, so it is checked by its shape, not its value.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const bench = (page: Page) => page.getByRole("complementary", { name: "Banquillo" });
const search = (page: Page) => bench(page).getByRole("searchbox", { name: "Buscar persona" });
/** The people's cards, without the open roles. */
const cards = (page: Page) => bench(page).locator("li[data-bench-person]");
const openRoles = (page: Page) => bench(page).locator("li[data-bench-open-role]");

async function openBench(page: Page) {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(bench(page)).toBeVisible();
  await expectHydrated(search(page));
}

test("the bench lists the active people by category, with how busy each is", async ({ page }) => {
  await openBench(page);

  await expect(bench(page).getByRole("status")).toHaveText("15 personas");
  await expect(cards(page)).toHaveCount(15);
  await expect(bench(page).getByRole("heading", { name: /^Senior Developer/ })).toBeVisible();
  for (const text of await cards(page).allTextContents()) {
    expect(text).toMatch(/Ocupación hoy: \d+\s%/);
  }
  // Plan A's people are on the team.
  const lead = cards(page).filter({ hasText: "Senior Developer 1" });
  await expect(lead).toContainText("En el equipo");
  await expect(bench(page)).not.toContainText("€");
});

test("the bench offers an open role of each category, until a name is searched", async ({
  page,
}) => {
  await openBench(page);

  await expect(openRoles(page)).toHaveCount(6);
  await expect(openRoles(page).first()).toHaveText(/Vacante/);
  await search(page).fill("developer 3");
  await expect(openRoles(page)).toHaveCount(0);
});

test("the bench is filtered with the keyboard alone", async ({ page }) => {
  await openBench(page);

  await search(page).focus();
  await page.keyboard.type("developer 3");
  await expect(cards(page)).toHaveText([
    /Frontend Developer 3/,
    /Junior Developer 3/,
    /Senior Developer 3/,
  ]);
  await expect(bench(page).getByRole("status")).toHaveText("3 personas");

  await page.keyboard.press("Tab");
  const category = bench(page).getByRole("combobox", { name: "Categoría" });
  await expect(category).toBeFocused();
  await category.selectOption({ label: "Junior Developer" });
  await expect(cards(page)).toHaveText([/Junior Developer 3/]);

  await search(page).fill("nadie");
  await expect(bench(page)).toContainText("Nadie coincide con la búsqueda");
  await bench(page).getByRole("button", { name: "Quitar filtros" }).press("Enter");
  await expect(cards(page)).toHaveCount(15);
});

test("the bench speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${GUIDE_SCENARIO}`);
  const english = page.getByRole("complementary", { name: "Bench" });
  await expect(english.getByRole("searchbox", { name: "Search people" })).toBeVisible();
  await expect(english.getByRole("status")).toHaveText("15 people");
});

test("the bench is not shown below xl, where the table needs the room", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 800 });
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(page.getByRole("main", { name: "Equipo" })).toBeVisible();
  await expect(bench(page)).toBeHidden();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the bench has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBench(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    // Without a search first: the open roles only show then.
    await expect(openRoles(page)).toHaveCount(6);
    await expectNoAxeViolations(page);
    await search(page).fill("senior");

    await expectNoAxeViolations(page);
  });
}
