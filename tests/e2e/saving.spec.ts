import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// The real saving path (ADR 0011): the first save of the guide scenario makes the visitor's copy,
// sets its cookie and moves the page to it; later saves go to the copy. Needs the demo organization
// (`pnpm db:migrate` and `pnpm db:seed`). Each test has its own browser context, so its own copy.
// Plan A: the project manager has the tech lead, the frontend developer and the DevOps open role
// under them.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const menu = (page: Page) => page.getByRole("menu");
const banner = (page: Page) => page.getByRole("banner");

/** Opens the guide scenario's tree, hydrated. */
async function openGuide(page: Page) {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);
  await expect(node(page, "Project manager")).toBeVisible();
  await expectHydrated(node(page, "Project manager"));
}

/** Removes an assignment with its menu, from the keyboard. */
async function remove(page: Page, name: string) {
  await node(page, name).focus();
  await page.keyboard.press("Enter");
  const item = menu(page).getByRole("menuitem", { name: "Quitar del equipo" });
  await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
  // The menu moves focus a frame after each key: End goes straight to the last item.
  await page.keyboard.press("End");
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(node(page, name)).toHaveCount(0);
}

const inCopy = (page: Page) => expect(page).not.toHaveURL(new RegExp(GUIDE_SCENARIO));
const saved = (page: Page) => expect(banner(page).getByText("Guardado")).toBeVisible();

test("an edit is saved in the visitor's copy, and its undo too", async ({ page, context }) => {
  await openGuide(page);

  await remove(page, "Tech lead");
  await inCopy(page);
  await saved(page);
  expect(await context.cookies()).toContainEqual(expect.objectContaining({ httpOnly: true }));
  const copy = page.url();

  // The history came along to the copy: the change can be undone there, and the undo is saved.
  // "Desktop Chrome" reports Windows, so the page takes Ctrl, whatever runs the test.
  await page.keyboard.press("Control+z");
  await expect(node(page, "Tech lead")).toBeVisible();
  await expect(page.locator("[aria-live='polite']").last()).toContainText("Deshecho.");
  await saved(page);

  await remove(page, "Frontend developer");
  await saved(page);
  await page.reload();
  expect(page.url()).toBe(copy);
  await expect(node(page, "Tech lead")).toBeVisible();
  await expect(node(page, "Frontend developer")).toHaveCount(0);
});

test("a failed save says so, and saves on retry", async ({ page }) => {
  // The Server Action is a POST that carries a `next-action` header.
  await page.route("**/scenarios/**", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort()
      : route.fallback(),
  );
  await openGuide(page);

  await remove(page, "Tech lead");
  // The header has two status regions: the save state's and the choice's.
  await expect(
    banner(page).getByRole("status").getByText("No se ha podido guardar", { exact: true }),
  ).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }

  await page.unrouteAll();
  await banner(page).getByRole("button", { name: "Reintentar" }).click();
  await inCopy(page);
  await saved(page);
  await page.reload();
  await expect(node(page, "Project manager")).toBeVisible();
  await expect(node(page, "Tech lead")).toHaveCount(0);
});

test("back leaves the copy and forward returns to it, where saving goes on", async ({ page }) => {
  await page.goto("/");
  await openGuide(page);
  await remove(page, "Tech lead");
  await inCopy(page);
  await saved(page);
  const copy = page.url();

  // The move to the copy replaced the template's entry: back leaves the scenario.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);

  await page.goForward();
  expect(page.url()).toBe(copy);
  await expect(node(page, "Project manager")).toBeVisible();
  await expect(node(page, "Tech lead")).toHaveCount(0);
  await expectHydrated(node(page, "Project manager"));
  // The page knows the copy's version: the next save is no conflict.
  await remove(page, "Frontend developer");
  await saved(page);

  await page.reload();
  await expect(node(page, "Project manager")).toBeVisible();
  await expect(node(page, "Tech lead")).toHaveCount(0);
  await expect(node(page, "Frontend developer")).toHaveCount(0);
});
