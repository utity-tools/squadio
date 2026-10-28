import { type Locator, type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). ADR 0008,
// point 1: one pointer-events layer drags from the bench into the tree and inside it. Each test
// edits the guide scenario in its own browser context, so its own visitor copy. Plan A: the project
// manager has the tech lead, the frontend developer and the DevOps open role under them.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const nodeGrip = (page: Page, name: string) =>
  tree(page)
    .locator(".react-flow__node", {
      // Inside the node: the inner locator starts from it, not from the tree.
      has: page.getByRole("button", { name: new RegExp(`^${name}\\s*,`) }),
    })
    .locator("[data-drag-grip]");
const bench = (page: Page) => page.getByRole("complementary", { name: "Banquillo" });
const benchCard = (page: Page, name: string) =>
  bench(page).getByRole("listitem").filter({ hasText: name });
const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });

async function openTree(page: Page) {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);
  await expect(node(page, "Project manager")).toBeVisible();
  await expectHydrated(node(page, "Project manager"));
}

/** The middle of an element, scrolled into view first: the bench scrolls on its own. */
async function centre(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("expected a visible element");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Presses the mouse on `from` and moves it, in steps, over `to`; `drop` lets go there. */
async function mouseDrag(page: Page, from: Locator, to: Locator, { drop = true } = {}) {
  const start = await centre(from);
  const end = await centre(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  if (drop) await page.mouse.up();
}

type Point = { x: number; y: number };

/** Drags a finger from `start` to `end`: Playwright's touchscreen only taps, so it goes through CDP. */
async function touchDrag(page: Page, start: Point, end: Point) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: Point) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [],
    });
  await touch("touchStart", start);
  for (let step = 1; step <= 8; step += 1) {
    await touch("touchMove", {
      x: start.x + ((end.x - start.x) * step) / 8,
      y: start.y + ((end.y - start.y) * step) / 8,
    });
  }
  await touch("touchEnd");
}

/** Shows the table, where each row says how deep it sits in the tree. */
async function showTable(page: Page) {
  await page
    .getByRole("radiogroup", { name: "Vista" })
    .getByRole("radio", { name: "Tabla" })
    .click();
  await expect(grid(page)).toBeVisible();
}

test("a person dragged from the bench onto a node joins the team under it", async ({ page }) => {
  await openTree(page);

  await mouseDrag(page, benchCard(page, "Junior Developer 2"), node(page, "Tech lead"));

  // The defaults of "Add to team…": the category's name as the project role, and 100%.
  const added = node(page, "Junior Developer");
  await expect(added).toBeFocused();
  await expect(added).toContainText("Junior Developer 2");
  await expect(added).toContainText("100 %");
  await expect(benchCard(page, "Junior Developer 2")).toContainText("En el equipo");
  await showTable(page);
  await expect(row(page, "Junior Developer")).toHaveAttribute("aria-level", "3");

  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(row(page, "Junior Developer")).toHaveCount(0);
});

test("an assignment dragged by its grip moves under the node it is dropped on", async ({
  page,
}) => {
  await openTree(page);

  await mouseDrag(page, nodeGrip(page, "DevOps engineer"), node(page, "Tech lead"));

  // The focus manager follows the moved node, as after "Move to…".
  await expect(node(page, "DevOps engineer")).toBeFocused();
  await expect(page).not.toHaveURL(new RegExp(GUIDE_SCENARIO));
  await showTable(page);
  await expect(row(page, "DevOps engineer")).toHaveAttribute("aria-level", "3");
});

test("a drop where the move would close a loop does nothing", async ({ page }) => {
  await openTree(page);

  await mouseDrag(page, nodeGrip(page, "Project manager"), node(page, "Tech lead"), {
    drop: false,
  });
  await expect(node(page, "Tech lead")).not.toHaveAttribute("data-drop-target");
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Deshacer" })).toBeDisabled();
});

test.describe("with touch", () => {
  test.use({ hasTouch: true });

  test("a person dragged by the grip onto the canvas joins the top of the team", async ({
    page,
  }) => {
    await openTree(page);
    const start = await centre(benchCard(page, "Junior Developer 2").locator("[data-drag-grip]"));
    const canvas = await tree(page).boundingBox();
    if (!canvas) throw new Error("expected the canvas");
    // An empty spot of the canvas, left of the tree.
    const end = { x: canvas.x + 40, y: canvas.y + canvas.height - 40 };

    await touchDrag(page, start, end);

    await expect(node(page, "Junior Developer")).toBeVisible();
    await showTable(page);
    await expect(row(page, "Junior Developer")).toHaveAttribute("aria-level", "1");
  });

  test("an assignment dragged by its grip moves under the node it is dropped on", async ({
    page,
  }) => {
    // The grip is "nopan": React Flow's touch panning leaves it to the drag layer.
    await openTree(page);

    await touchDrag(
      page,
      await centre(nodeGrip(page, "DevOps engineer")),
      await centre(node(page, "Tech lead")),
    );

    await expect(page).not.toHaveURL(new RegExp(GUIDE_SCENARIO));
    await showTable(page);
    await expect(row(page, "DevOps engineer")).toHaveAttribute("aria-level", "3");
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a drag in progress has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openTree(page);

    await mouseDrag(page, benchCard(page, "Junior Developer 2"), node(page, "Tech lead"), {
      drop: false,
    });
    await expect(node(page, "Tech lead")).toHaveAttribute("data-drop-target");
    await expectNoAxeViolations(page);

    await page.keyboard.press("Escape");
    await expect(node(page, "Tech lead")).not.toHaveAttribute("data-drop-target");
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Deshacer" })).toBeDisabled();
  });
}
