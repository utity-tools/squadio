import { type Page, expect } from "@playwright/test";

/**
 * Waits until a first save has moved the page to the visitor's copy of `templateId` (ADR 0011).
 * "Guardado" shows before the move ends, and axe run in between finds a page half-built: for a
 * moment the scenario's loading skeleton, which has no h1, and, when the copy's page commits, no
 * `<title>`, which its metadata brings a few milliseconds later. So wait for the copy's URL, its
 * h1 and its title, in the order they come.
 */
export async function expectOnCopy(page: Page, templateId: string) {
  await expect(page).not.toHaveURL(new RegExp(templateId));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/\S/);
}
