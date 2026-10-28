import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both).
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";
/** A team of one: fitting it to the canvas would blow its card up. */
const ONE_NODE_SCENARIO = "6d656d6f-0000-4000-8000-000000000204";
/** A card's width at 100% (`NODE_WIDTH` in src/lib/layout/compact-layout.ts). */
const NODE_WIDTH = 240;

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: RegExp) => tree(page).getByRole("button", { name });

/** Tabs from the view switch, past "Add to team…", into the tree once it is drawn. */
async function tabIntoTree(page: Page) {
  await expect(node(page, /^Project manager/)).toBeVisible();
  await page
    .getByRole("radiogroup", { name: "Vista" })
    .getByRole("radio", { checked: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Añadir al equipo…" })).toBeFocused();
  await page.keyboard.press("Tab");
}

test("the guide scenario draws its team as a tree, the open role dashed", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  for (const name of [/^Project manager/, /^Tech lead/, /^Frontend developer/, /^DevOps/]) {
    await expect(node(page, name)).toBeInViewport();
  }
  await expect(node(page, /^DevOps engineer\s*,\s*Vacante\s*,\s*DevOps Engineer/)).toHaveCSS(
    "border-style",
    "dashed",
  );
  await expect(node(page, /^Tech lead/)).toContainText("h efectivas");
  await expect(tree(page)).not.toContainText("€");
  await expect(tree(page).getByRole("link", { name: "React Flow" })).toBeVisible();
});

test("the tree is one tab stop that moves with the arrows and highlights the path", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  await tabIntoTree(page);
  await expect(node(page, /^Project manager/)).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(node(page, /^Tech lead/)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const devOps = node(page, /^DevOps/);
  await expect(devOps).toBeFocused();
  await expect(devOps).toHaveAttribute("aria-current", "true");
  await expect(node(page, /^Project manager/)).toHaveAttribute("data-on-path");
  await expect(node(page, /^Tech lead/)).not.toHaveAttribute("data-on-path");

  // Leaving and coming back lands on the node last focused.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(devOps).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await expect(node(page, /^Project manager/)).toBeFocused();
});

test("clicking a node selects it", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  await node(page, /^Frontend developer/).click();

  await expect(node(page, /^Frontend developer/)).toHaveAttribute("aria-current", "true");
  await expect(node(page, /^Project manager/)).toHaveAttribute("data-on-path");
});

test("the canvas zooms with named buttons and fits the team back in view", async ({ page }) => {
  await page.goto(`/en/scenarios/${GUIDE_SCENARIO}`);
  const controls = page.getByRole("group", { name: "Canvas controls" });
  const devOps = page.getByRole("button", { name: /^DevOps engineer\s*,\s*Open role/ });
  await expect(devOps).toBeInViewport({ ratio: 1 });

  for (let step = 0; step < 3; step++) {
    await controls.getByRole("button", { name: "Zoom in" }).click();
  }
  await expect(devOps).not.toBeInViewport({ ratio: 1 });

  await controls.getByRole("button", { name: "Fit the team in view" }).click();
  await expect(devOps).toBeInViewport({ ratio: 1 });

  // The keys do the same from inside the tree: plus zooms in, zero fits.
  await page.getByRole("button", { name: /^Project manager/ }).focus();
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await expect(devOps).not.toBeInViewport({ ratio: 1 });
  await page.keyboard.press("0");
  await expect(devOps).toBeInViewport({ ratio: 1 });

  // Zooming keeps the focused node in view.
  await devOps.focus();
  for (let step = 0; step < 4; step++) await page.keyboard.press("+");
  await expect(devOps).toBeInViewport({ ratio: 1 });
  await expect(controls.getByRole("button", { name: "Zoom out" })).toBeVisible();
});

test("fitting the view draws the cards at their natural size, never larger", async ({ page }) => {
  await page.goto(`/scenarios/${ONE_NODE_SCENARIO}`);
  const card = node(page, /^Developer/);
  const width = async () => (await card.boundingBox())?.width ?? Infinity;

  // A team of one would fill the canvas: fitting stops at 100%, on load and with the fit button.
  await expect.poll(width).toBeCloseTo(NODE_WIDTH, 0);
  for (const step of ["Alejar", "Alejar", "Ajustar el equipo a la vista"]) {
    await page.getByRole("button", { name: step }).click();
  }
  await expect.poll(width).toBeCloseTo(NODE_WIDTH, 0);
  await expect(card).toBeInViewport({ ratio: 1 });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the tree with a selected path has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await tabIntoTree(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(node(page, /^DevOps/)).toHaveAttribute("aria-current", "true");

    await expectNoAxeViolations(page);
  });
}
