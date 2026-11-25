import { type Page, expect } from "@playwright/test";

import { expectOnCopy } from "./copy";
import { expectHydrated } from "./hydration";

// The demo's guide case, Plan A of Customer portal: a project without a planned period.
export const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

export const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
export const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
export const banner = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const menu = (page: Page) => page.getByRole("menu");

/** Removes an assignment with its menu, from the keyboard. */
export async function remove(page: Page, name: string) {
  await node(page, name).focus();
  await page.keyboard.press("Enter");
  await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
  // The menu moves focus a frame after each key: End goes straight to the last item.
  await page.keyboard.press("End");
  await expect(menu(page).getByRole("menuitem", { name: "Quitar del equipo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(node(page, name)).toHaveCount(0);
}

/**
 * Removes Plan A's whole team, the reports before their manager, and waits for the copy. The first
 * removal saves a visitor copy and the page moves to it; each test has its own browser context, so
 * its own copy.
 */
export async function emptyTheTeam(page: Page) {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);
  await expect(node(page, "Project manager")).toBeVisible();
  await expectHydrated(node(page, "Project manager"));
  // The first removal moves the page to the copy: wait for it, hydrated, before the next key.
  await remove(page, "Tech lead");
  await expectOnCopy(page, GUIDE_SCENARIO);
  await expectHydrated(node(page, "Project manager"));
  for (const name of ["Frontend developer", "DevOps engineer", "Project manager"])
    await remove(page, name);
  await expect(banner(page).getByText("Guardado")).toBeVisible();
}
