import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectOnCopy } from "./support/copy";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Sharing a revision", and ADR 0013 with its amendment of 2026-11-23: a revision's
// page shows it read only, as stored; with rate access its result, without it no money; and when
// the scenario has a newer revision it says so and links to it. Visitors open the demo's
// revisions and their copy's. Needs the demo organization (`pnpm db:migrate` and `pnpm db:seed`).
// Each test has its own browser context, so its own copy.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GUIDE_SCENARIO = demoId(200);
const DELIVERY_SCENARIO = demoId(205);
const DELIVERY_REVISION = demoId(500);

const details = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const rail = (page: Page) => page.getByRole("complementary", { name: "Resumen" });
const team = (page: Page) => page.getByRole("main", { name: "Equipo" });
const revisions = (page: Page) => rail(page).getByRole("region", { name: "Revisiones" });
const saveButton = (page: Page) =>
  details(page).getByRole("button", { name: /^Guardar revisión$|^Guardando revisión…$/ });
const outcome = (page: Page) =>
  details(page)
    .getByRole("status")
    .filter({ hasText: /Revisión|revisión/ });
const newer = (page: Page) => details(page).getByRole("note");

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

test("the demo's revision opens from the scenario's list, read only, with its result", async ({
  page,
}) => {
  await page.goto(`/scenarios/${DELIVERY_SCENARIO}`);
  const link = revisions(page).getByRole("link", { name: "Revisión 1" });
  await expectHydrated(link);
  await link.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/revisions/${DELIVERY_REVISION}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
  await expect(details(page)).toContainText("visitante");
  await expect(details(page)).toContainText("elegida");
  await expect(details(page).getByText("Solo lectura: una revisión nunca cambia.")).toBeVisible();
  await expect(newer(page)).toHaveCount(0);
  await expect(team(page).getByRole("treegrid")).toBeVisible();
  await expect(team(page).getByRole("button", { name: /^Acciones de/ })).toHaveCount(0);
  await expect(rail(page)).toContainText("€");
  await expect(page.getByRole("button", { name: "Guardar revisión" })).toHaveCount(0);
  await expectAccessible(page);

  await details(page).getByRole("link", { name: "Abrir el escenario" }).click();
  await expect(page).toHaveURL(new RegExp(`/scenarios/${DELIVERY_SCENARIO}$`));
});

test("without rate access the revision shows its team and hours, and no money", async ({
  page,
}) => {
  await page.goto(`/revisions/${DELIVERY_REVISION}?access=none`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
  await expect(team(page).getByRole("treegrid")).toBeVisible();
  await expect(rail(page)).toContainText("h");
  await expect(page.locator("body")).not.toContainText("€");
  await expect(details(page).getByRole("link", { name: "Abrir el escenario" })).toHaveAttribute(
    "href",
    /\?access=none$/,
  );
  await expectNoAxeViolations(page);
});

test("an older revision says a newer one exists and links to it", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expectHydrated(saveButton(page));
  await saveButton(page).click();
  await expectOnCopy(page, GUIDE_SCENARIO);
  await expect(outcome(page)).toHaveText("Revisión 1 guardada");
  const copy = new URL(page.url()).pathname;

  const first = revisions(page).getByRole("link", { name: "Revisión 1" });
  const firstHref = await first.getAttribute("href");
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan A · Revisión 1");
  await expect(newer(page)).toHaveCount(0);
  await expect(details(page)).toContainText("visitante");
  await expect(details(page)).toContainText("guardada");
  await expectNoAxeViolations(page);

  // Revision 2: the team changes, so the latest is no longer revision 1.
  await page.goto(`${copy}?view=tree`);
  await expectHydrated(saveButton(page));
  const tree = page.getByRole("application", { name: "Árbol del equipo" });
  await tree.getByRole("button", { name: /^Tech lead\s*,/ }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  const removeItem = menu.getByRole("menuitem", { name: "Quitar del equipo" });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(removeItem).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tree.getByRole("button", { name: /^Tech lead\s*,/ })).toHaveCount(0);
  await saveButton(page).click();
  await expect(outcome(page)).toHaveText("Revisión 2 guardada");

  await page.goto(firstHref ?? "/");
  await expect(newer(page)).toHaveText(
    "Este escenario tiene una revisión más nueva. Ver la revisión 2",
  );
  // Revision 1 keeps the team it stored.
  await expect(team(page).getByRole("treegrid")).toContainText("Tech lead");
  await expectAccessible(page);

  const latest = newer(page).getByRole("link", { name: "Ver la revisión 2" });
  await latest.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan A · Revisión 2");
  await expect(newer(page)).toHaveCount(0);
  await expect(team(page).getByRole("treegrid")).not.toContainText("Tech lead");
});

test("a visitor with a copy who opens the demo's revision is led to their copy of it", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expectHydrated(saveButton(page));
  await saveButton(page).click();
  await expectOnCopy(page, GUIDE_SCENARIO);

  await page.goto(`/revisions/${DELIVERY_REVISION}`);
  await expect(page).not.toHaveURL(new RegExp(DELIVERY_REVISION));
  await expect(page).toHaveURL(/\/revisions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
});

test("an unknown revision is not found", async ({ page }) => {
  await page.goto(`/revisions/${demoId(599)}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
  ).toBeVisible();
});
