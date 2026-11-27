import { type Page, expect } from "@playwright/test";

import { expectHydrated } from "./hydration";

/** The bench, docked under the team from lg; Playwright's desktop viewport is 1280 px wide. */
export const bench = (page: Page, name = "Banquillo") => page.getByRole("complementary", { name });

/** The bench's handle, named for what it does next. */
export const benchHandle = (page: Page) =>
  bench(page).getByRole("button", { name: /^(Subir|Bajar) el banquillo$/ });

/**
 * Raises the docked bench with its handle and keeps it up: folded, only its row of filters peeks
 * out, and its lanes are clipped under the team's foot.
 */
export async function raiseBench(page: Page) {
  const handle = benchHandle(page);
  await expectHydrated(handle);
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await handle.click();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect(handle).toHaveAccessibleName("Bajar el banquillo");
}

/** The bench's height on screen, in whole pixels: poll it, since it rises and folds smoothly. */
export async function benchHeight(page: Page) {
  const box = await bench(page).boundingBox();
  if (!box) throw new Error("expected the bench on screen");
  return Math.round(box.height);
}
