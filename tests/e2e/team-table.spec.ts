import { type Locator, type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both).
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const PHONE = { width: 375, height: 812 };

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
const views = (page: Page) => page.getByRole("radiogroup", { name: "Vista" });
const node = (page: Page, name: RegExp) => tree(page).getByRole("button", { name });
/** A body row, by the role in its first cell. */
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });
const bodyRows = (page: Page) => grid(page).locator("tbody").getByRole("row");
const footer = (page: Page) => grid(page).getByRole("row", { name: /^Total/ });

/** Tabs from the view switch, the stop before the view, into the grid. */
async function tabIntoGrid(page: Page) {
  await expect(row(page, "Project manager")).toBeVisible();
  await views(page).getByRole("radio", { checked: true }).focus();
  await page.keyboard.press("Tab");
}

/** Collects the console errors of the page, hydration mismatches among them. */
function consoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("a wide screen opens the tree without a view in the URL", async ({ page }) => {
  const errors = consoleErrors(page);
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  await expect(node(page, /^Project manager/)).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
  await expect(views(page).getByRole("radio", { name: "Árbol" })).toBeChecked();
  expect(errors).toEqual([]);

  // The width chose once: a narrower window (a zoom, a turned tablet) keeps the view on screen.
  await page.setViewportSize(PHONE);
  await expect(node(page, /^Project manager/)).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE });

  test("the table opens without a view in the URL", async ({ page }) => {
    const errors = consoleErrors(page);
    await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

    await expect(grid(page)).toBeVisible();
    await expect(tree(page)).toHaveCount(0);
    await expect(views(page).getByRole("radio", { name: "Tabla" })).toBeChecked();
    expect(errors).toEqual([]);
    // The table scrolls inside its region; the page itself is no wider than the screen.
    const size = await page.evaluate(() => {
      const root = document.scrollingElement!;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the table has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await tabIntoGrid(page);
      await expect(row(page, "Project manager")).toHaveAttribute("aria-selected", "true");

      await expectNoAxeViolations(page);
    });
  }

  test("the view in the URL wins over the width", async ({ page }) => {
    await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);

    await expect(node(page, /^Project manager/)).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
  });
});

test("the table lists the guide team with its open role and totals, and no money", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=table`);

  await expect(bodyRows(page)).toHaveCount(4);
  for (const title of ["Project manager", "Tech lead", "Frontend developer", "DevOps engineer"]) {
    await expect(row(page, title)).toBeVisible();
  }
  await expect(row(page, "DevOps engineer").getByRole("gridcell").nth(1)).toHaveText("Vacante");
  // 130 working days at 8 h for three full-time seats; the effective hours depend on the demo's
  // calendar (docs/domain.md, "Configuration per organization").
  const totals = footer(page).getByRole("gridcell");
  await expect(totals).toHaveText(["", "", "", "", "", "", "3120", /^\d+(,\d+)?$/]);
  await expect(grid(page)).not.toContainText("€");
});

test("the keyboard moves from the view switch into the grid, and a collapse is in the URL", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=table`);

  await tabIntoGrid(page);
  await expect(row(page, "Project manager")).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Tech lead")).toBeFocused();
  await expect(row(page, "Tech lead")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Project manager")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Project manager")).toHaveAttribute("aria-expanded", "false");
  await expect(bodyRows(page)).toHaveCount(1);
  await expect(page).toHaveURL(/[?&]collapsed=[0-9a-f-]{36}(&|$)/);
  await expect(page).toHaveURL(/[?&]view=table(&|$)/);

  await page.reload();
  await expect(row(page, "Project manager")).toHaveAttribute("aria-expanded", "false");
  await expect(bodyRows(page)).toHaveCount(1);

  await row(page, "Project manager").focus();
  await page.keyboard.press("ArrowRight");
  await expect(bodyRows(page)).toHaveCount(4);
  await expect(page).not.toHaveURL(/collapsed=/);
});

test("the totals footer is the last row of the grid keys, and never selected", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=table`);
  await tabIntoGrid(page);

  await page.keyboard.press("End");
  await expect(footer(page)).toBeFocused();
  await expect(footer(page)).toHaveAttribute("aria-level", "1");
  await expect(footer(page)).not.toHaveAttribute("aria-selected");
  await expect(row(page, "Project manager")).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowUp");
  await expect(row(page, "DevOps engineer")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+End");
  await expect(footer(page).getByRole("gridcell").first()).toBeFocused();
  await page.keyboard.press("Control+Home");
  await expect(row(page, "Project manager").getByRole("gridcell").nth(1)).toBeFocused();
});

test("the arrow keys choose a view in the switch", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(node(page, /^Project manager/)).toBeVisible();
  await views(page).getByRole("radio", { name: "Árbol" }).focus();

  await page.keyboard.press("ArrowRight");

  const table = views(page).getByRole("radio", { name: "Tabla" });
  await expect(table).toBeChecked();
  await expect(table).toBeFocused();
  await expect(grid(page)).toBeVisible();
  await expect(page).toHaveURL(/[?&]view=table(&|$)/);
});

test("switching views keeps the selection, both ways, and the focus on the switch", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  await node(page, /^DevOps/).click();
  await expect(node(page, /^DevOps/)).toHaveAttribute("aria-current", "true");
  const table = views(page).getByRole("radio", { name: "Tabla" });
  await table.click();

  await expect(page).toHaveURL(/[?&]view=table(&|$)/);
  await expect(table).toBeFocused();
  await expect(row(page, "DevOps engineer")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "DevOps engineer")).toHaveAttribute("tabindex", "0");
  await expect(row(page, "Project manager")).toHaveAttribute("aria-selected", "false");

  await row(page, "Tech lead").getByRole("gridcell").nth(2).click();
  await views(page).getByRole("radio", { name: "Árbol" }).click();

  await expect(page).toHaveURL(/[?&]view=tree(&|$)/);
  await expect(node(page, /^Tech lead/)).toHaveAttribute("aria-current", "true");
  await expect(node(page, /^Tech lead/)).toHaveAttribute("tabindex", "0");
});

test("a selection under a collapsed manager is shown when switching to the table", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=table`);
  await tabIntoGrid(page);
  await page.keyboard.press("ArrowLeft");
  await expect(bodyRows(page)).toHaveCount(1);
  await views(page).getByRole("radio", { name: "Árbol" }).click();
  await expect(page).toHaveURL(/[?&]collapsed=/);

  await node(page, /^DevOps/).click();
  await views(page).getByRole("radio", { name: "Tabla" }).click();

  await expect(row(page, "Project manager")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "DevOps engineer")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "DevOps engineer")).toHaveAttribute("tabindex", "0");
  await expect(page).not.toHaveURL(/collapsed=/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the table has no accessibility violations in the ${colorScheme} theme, row, cell or collapsed`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=table`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await tabIntoGrid(page);
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "Tech lead")).toHaveAttribute("aria-selected", "true");
    // The selected row is marked by more than its colour: a 4 px bar at its start, set in from
    // the table's edge, on a background apart from the page's.
    const marker = row(page, "Tech lead").locator("[data-selected-marker]");
    await expect(marker).toBeVisible();
    const [bar, table] = await Promise.all([marker.boundingBox(), grid(page).boundingBox()]);
    expect(bar!.width).toBe(4);
    expect(bar!.x - table!.x).toBeGreaterThanOrEqual(2);
    const background = (locator: Locator) =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await background(row(page, "Tech lead"))).not.toBe(
      await background(page.locator("body")),
    );
    await expectNoAxeViolations(page);

    await page.keyboard.press("ArrowRight");
    await expect(row(page, "Tech lead").getByRole("gridcell").first()).toBeFocused();
    await expectNoAxeViolations(page);

    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(row(page, "Project manager")).toHaveAttribute("aria-expanded", "false");
    await expectNoAxeViolations(page);
  });
}
