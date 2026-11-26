import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectOnCopy } from "./support/copy";
import { expectHydrated } from "./support/hydration";
import { openHistory } from "./support/scenario-card";

// docs/domain.md, "Revisions", and ADR 0013: «Guardar revisión» saves a revision of the scenario
// as the page shows it, with rate access only, and the summary rail lists every revision to
// everyone. The demo template is never written, so a visitor's first revision makes their copy, as
// a first save does (ADR 0011). Needs the demo organization (`pnpm db:migrate` and `pnpm db:seed`).
// Each test has its own browser context, so its own copy.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GUIDE_SCENARIO = demoId(200);
const DELIVERY_SCENARIO = demoId(205);

const banner = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const rail = (page: Page) => page.getByRole("complementary", { name: "Resumen" });
const revisions = (page: Page) => rail(page).getByRole("region", { name: "Revisiones" });
const saveButton = (page: Page) =>
  banner(page).getByRole("button", { name: /^Guardar revisión$|^Guardando revisión…$/ });
const outcome = (page: Page) =>
  banner(page)
    .getByRole("status")
    .filter({ hasText: /Revisión|revisión/ });

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });

async function openScenario(page: Page, scenarioId: string, query = "") {
  await page.goto(`/scenarios/${scenarioId}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectHydrated(banner(page).getByRole("button", { name: "Deshacer" }));
}

/** Removes an assignment with its menu, from the keyboard, as saving.spec.ts does. */
async function remove(page: Page, name: string) {
  await node(page, name).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  const item = menu.getByRole("menuitem", { name: "Quitar del equipo" });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(node(page, name)).toHaveCount(0);
}

const lines = (page: Page) => revisions(page).getByRole("listitem");

test("a visitor saves revision 1 of the demo in their copy, and saving again reuses it", async ({
  page,
  context,
}) => {
  await openScenario(page, GUIDE_SCENARIO);
  await openHistory(page);
  await expect(revisions(page).getByText("Todavía no hay revisiones")).toBeVisible();

  await saveButton(page).focus();
  await page.keyboard.press("Enter");

  // The first write made the visitor's copy, and the page moved to it with the revision listed.
  await expectOnCopy(page, GUIDE_SCENARIO);
  expect(await context.cookies()).toContainEqual(expect.objectContaining({ httpOnly: true }));
  await openHistory(page);
  await expect(lines(page)).toHaveCount(1);
  await expect(outcome(page)).toHaveText("Revisión 1 guardada");
  await expect(lines(page).first()).toContainText("Revisión 1");
  await expect(lines(page).first()).toContainText("visitante");
  await expect(lines(page).first()).toContainText("guardada");

  await expectHydrated(saveButton(page));
  await saveButton(page).click();
  await expect(outcome(page)).toHaveText("Sin cambios: se usa la revisión 1");
  await expect(lines(page)).toHaveCount(1);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
});

test("saving right after an edit saves the edit first, and makes revision 2", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);
  await expectHydrated(node(page, "Project manager"));
  await saveButton(page).click();
  await expectOnCopy(page, GUIDE_SCENARIO);
  await openHistory(page);
  await expect(lines(page)).toHaveCount(1);
  await expectHydrated(node(page, "Project manager"));

  // No waiting for the autosave: the revision saves the edit first.
  await remove(page, "Tech lead");
  await saveButton(page).click();
  await expect(outcome(page)).toHaveText("Revisión 2 guardada");
  await expect(banner(page).getByText("Guardado")).toBeVisible();
  await expect(lines(page)).toHaveCount(2);
  await expect(lines(page).first()).toContainText("Revisión 2");

  // Revision 2 holds the edit: after a reload the team is still without the tech lead.
  await page.reload();
  await expect(node(page, "Project manager")).toBeVisible();
  await expect(node(page, "Tech lead")).toHaveCount(0);
  await openHistory(page);
  await expect(lines(page)).toHaveCount(2);
});

test("without rate access nothing offers to save a revision, and the list is still there", async ({
  page,
}) => {
  await openScenario(page, DELIVERY_SCENARIO, "?access=none");
  await expect(saveButton(page)).toHaveCount(0);
  await openHistory(page);
  await expect(lines(page)).toHaveCount(1);
  await expectNoAxeViolations(page);
});

test("the demo lists the revision made when the delivery plan was chosen", async ({ page }) => {
  await openScenario(page, DELIVERY_SCENARIO);
  await openHistory(page);
  await expect(lines(page)).toHaveCount(1);
  const line = lines(page).first();
  await expect(line).toContainText("Revisión 1");
  await expect(line).toContainText("visitante");
  await expect(line).toContainText("elegida");
  await expect(line.locator("time")).toHaveAttribute("datetime", /T12:00:00\.000Z$/);
});
