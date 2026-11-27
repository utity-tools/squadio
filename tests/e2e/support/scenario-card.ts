import { type Page, expect } from "@playwright/test";

import { expectHydrated } from "./hydration";

// ADR 0017: the scenario's card on the right holds its result, its history and its details in
// tabs, and opens on the result. A page that moves to the visitor's copy opens on it again.

/** The card: organization, project, name, state, terms and origin, then the tabs. */
export const scenarioCard = (page: Page) => page.locator("#scenario-card");

/** The «Historial» tab's timeline: the scenario's revisions, newest first, then its origin. */
export const historyTimeline = (page: Page) => page.getByRole("list", { name: "Historial" });

/** The timeline's steps, newest first. */
export const historySteps = (page: Page) => historyTimeline(page).getByRole("listitem");

/** Opens the card's «Historial» tab, where the scenario's history is a timeline. */
export async function openHistory(page: Page) {
  await openTab(page, "Historial");
}

/**
 * Opens the card's «Resultado» tab. Next.js keeps a page it leaves, so coming back to the editor
 * finds the tab it was left on.
 */
export async function openResult(page: Page) {
  await openTab(page, "Resultado");
}

async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expectHydrated(tab);
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
