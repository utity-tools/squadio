import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { bench, benchHandle, benchHeight, raiseBench } from "./support/bench";
import { expectHydrated } from "./support/hydration";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). The bench docks
// under the team from `lg`; Playwright's desktop viewport is 1280 px wide. The seed anchors its
// ongoing scenarios to the day it runs (docs/domain.md, "The demo's dates"), so today's occupancy
// is known.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const search = (page: Page) => bench(page).getByRole("searchbox", { name: "Buscar persona" });
/** The people's cards, without the open roles. */
const cards = (page: Page) => bench(page).locator("li[data-bench-person]");
const openRoles = (page: Page) => bench(page).locator("li[data-bench-open-role]");

/** Opens the guide scenario with the bench raised, so its lanes are on screen. */
async function openBench(page: Page) {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(bench(page)).toBeVisible();
  await expectHydrated(search(page));
  await raiseBench(page);
}

/** What names the focused element: its own label, the label it is for, or its text. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    const labels =
      active && "labels" in active ? (active.labels as NodeListOf<HTMLLabelElement>) : null;
    return (
      active?.getAttribute("aria-label") ?? labels?.[0]?.textContent ?? active?.textContent?.trim()
    );
  });

/** The team's column: the team, with the bench docked at its foot. */
const teamColumn = (page: Page) => page.getByRole("main", { name: "Equipo" }).locator("xpath=..");
const add = (page: Page) => page.getByRole("button", { name: "Añadir al equipo…" });

test("the bench peeks out under the team, and rises over it on the keyboard's focus", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expectHydrated(search(page));

  // Folded: only its row, as wide as the team, at the column's foot, with «Añadir al equipo…».
  await expect.poll(() => benchHeight(page)).toBe(56);
  const column = await teamColumn(page).boundingBox();
  const dock = await bench(page).boundingBox();
  expect(dock && column && Math.round(dock.width)).toBe(column && Math.round(column.width));
  expect(dock && column && Math.round(dock.y + dock.height)).toBe(
    column && Math.round(column.y + column.height),
  );
  await expect(bench(page).getByRole("heading", { level: 2, name: "Banquillo" })).toBeVisible();
  await expect(
    bench(page).locator("[data-bench-actions]").getByRole("button"),
  ).toHaveAccessibleName("Añadir al equipo…");
  await expect(benchHandle(page)).toHaveAccessibleName("Subir el banquillo");

  // The keyboard's focus raises it, not to keep it there: the handle does.
  await search(page).focus();
  await expect.poll(() => benchHeight(page)).toBe(288);
  await expect(benchHandle(page)).toHaveAttribute("aria-expanded", "false");

  // Escape folds it and leaves the focus where it is, until the focus moves on.
  await page.keyboard.press("Escape");
  await expect.poll(() => benchHeight(page)).toBe(56);
  await expect(search(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bench(page).getByRole("combobox", { name: "Categoría" })).toBeFocused();
  await expect.poll(() => benchHeight(page)).toBe(288);

  // Scrolled while open, it folds back to its row, not to wherever it was scrolled.
  await bench(page).evaluate((dock) => (dock.scrollTop = 200));
  await expect.poll(() => bench(page).evaluate((dock) => dock.scrollTop)).toBeGreaterThan(0);
  await page
    .getByRole("radiogroup", { name: "Vista" })
    .getByRole("radio", { checked: true })
    .focus();
  await expect.poll(() => benchHeight(page)).toBe(56);
  expect(await bench(page).evaluate((dock) => dock.scrollTop)).toBe(0);
});

test("the handle keeps the bench up at three quarters of the team, until Escape", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expectHydrated(search(page));
  await raiseBench(page);

  const column = await teamColumn(page).boundingBox();
  if (!column) throw new Error("expected the team's column on screen");
  await expect.poll(() => benchHeight(page)).toBe(Math.round(column.height * 0.75));
  await expect(cards(page).first()).toBeInViewport();
  await expectNoAxeViolations(page);

  // Escape inside lowers it to its row, and leaves the focus on the handle.
  await search(page).focus();
  await page.keyboard.press("Escape");
  await expect(benchHandle(page)).toBeFocused();
  await expect(benchHandle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(benchHandle(page)).toHaveAccessibleName("Subir el banquillo");
  await expect.poll(() => benchHeight(page)).toBe(56);

  // The handle raises it again with the keyboard.
  await page.keyboard.press("Enter");
  await expect(benchHandle(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(benchHandle(page)).toHaveAttribute("aria-expanded", "false");
});

test("Tab goes from the view switch to the team, then to the bench, as they lie", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);
  const lead = page
    .getByRole("application", { name: "Árbol del equipo" })
    .getByRole("button", { name: /^Project manager\s*,/ });
  await expectHydrated(lead);
  await expectHydrated(add(page));

  await page
    .getByRole("radiogroup", { name: "Vista" })
    .getByRole("radio", { checked: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(lead).toBeFocused();
  // Past the canvas's zoom buttons, into the bench: its region, its handle, then its row.
  const stops: (string | undefined)[] = [];
  while (stops.length < 10 && stops.at(-1) !== "Añadir al equipo…") {
    await page.keyboard.press("Tab");
    stops.push(await focusedName(page));
  }
  expect(stops.slice(-5)).toEqual([
    "Banquillo",
    "Subir el banquillo",
    "Buscar persona",
    "Categoría",
    "Añadir al equipo…",
  ]);
  await expect(add(page)).toBeFocused();
});

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

test("the bench shows today's occupancy of the ongoing projects, whatever the date", async ({
  page,
}) => {
  await openBench(page);

  const card = (name: string) => cards(page).filter({ hasText: name });
  await expect(card("Senior Developer 4")).toContainText(/Ocupación hoy: 130\s%/);
  await expect(card("Senior Developer 4")).toContainText("Sobreasignación");
  await expect(card("Project Manager 1")).toContainText(/Ocupación hoy: 100\s%/);
  await expect(card("Frontend Developer 3")).toContainText(/Ocupación hoy: 100\s%/);
  await expect(card("Junior Developer 3")).toContainText(/Ocupación hoy: 60\s%/);
  await expect(card("DevOps Engineer 2")).toContainText(/Ocupación hoy: 40\s%/);
  await expect(card("Senior Developer 1")).toContainText(/Ocupación hoy: 0\s%/);
  await expect(card("Senior Developer 1")).not.toContainText("Sobreasignación");
  // The scenario takes place in 2027: the bench says the day it measures and what it is not.
  await expect(bench(page)).toContainText(
    /Ocupación a \d{1,2} de \p{L}+ de \d{4}, según los escenarios elegidos en Squadio\. No es la disponibilidad durante el proyecto\./u,
  );
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
  await expect(bench(page)).toContainText("Nadie coincide con «nadie»");
  await bench(page).getByRole("button", { name: "Quitar filtros" }).press("Enter");
  await expect(cards(page)).toHaveCount(15);
});

test("the bench speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${GUIDE_SCENARIO}`);
  const english = bench(page, "Bench");
  await expect(english.getByRole("searchbox", { name: "Search people" })).toBeVisible();
  await expect(english.getByRole("status")).toHaveText("15 people");
  await expect(english.getByRole("button", { name: "Raise the bench" })).toBeAttached();
});

test("the bench docks from lg, and is not shown below it", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 800 });
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(bench(page)).toBeVisible();

  // Below lg «Añadir al equipo…» lists the people, from the views' bar.
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByRole("main", { name: "Equipo" })).toBeVisible();
  await expect(bench(page)).toBeHidden();
  await expect(add(page)).toBeVisible();
  await expect(page.locator("[data-bench-actions] button")).toHaveCount(0);
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
