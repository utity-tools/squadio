import type { Page } from "@playwright/test";

import { copyId } from "@/lib/visitors/copy-id";

import { expectNoAxeViolations } from "./support/axe";
import { expectOnCopy } from "./support/copy";
import { expectHydrated } from "./support/hydration";
import { expect, test } from "./support/signed-in";

// docs/domain.md, "Choosing a revision", and ADR 0013: «Elegir esta revisión» on a revision's page
// lists what changed since it was made, the change check, and moves the scenario's choice to it on
// confirmation; the page then says it is the chosen one. A viewer and `?access=none` are not
// offered it. Needs the demo organization (`pnpm db:migrate` and `pnpm db:seed`); each test has its
// own browser context, and each signed-in test an organization of its own.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GUIDE_SCENARIO = demoId(200);
const DELIVERY_REVISION = demoId(500);

const banner = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const rail = (page: Page) => page.getByRole("complementary", { name: "Resumen" });
const revisionLines = (page: Page) =>
  rail(page).getByRole("region", { name: "Revisiones" }).getByRole("listitem");
const chooseButton = (page: Page) =>
  banner(page).getByRole("button", { name: "Elegir esta revisión" });
const chosenChip = (page: Page) => banner(page).getByText("Revisión elegida", { exact: true });
const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

/** Removes an assignment with its menu, from the keyboard, as revisions.spec.ts does. */
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

test("an older revision is chosen after the check lists the team saved since (Old revision chosen)", async ({
  page,
}) => {
  // Revision 1 of Plan A, then Plan A saved without the DevOps engineer.
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=tree`);
  await expectHydrated(node(page, "Project manager"));
  await banner(page).getByRole("button", { name: "Guardar revisión" }).click();
  await expectOnCopy(page, GUIDE_SCENARIO);
  await expect(revisionLines(page)).toHaveCount(1);
  await expectHydrated(node(page, "DevOps engineer"));
  await remove(page, "DevOps engineer");
  await expect(banner(page).getByText("Guardado")).toBeVisible();

  await revisionLines(page).first().getByRole("link", { name: "Revisión 1" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan A · Revisión 1");
  await expectHydrated(chooseButton(page));

  // From the keyboard: the dialog opens, lists the change and chooses.
  await chooseButton(page).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "¿Elegir la revisión 1?" });
  const changes = dialog.getByRole("region", { name: "Qué ha cambiado desde que se hizo" });
  await expect(changes.getByRole("listitem")).toHaveText([
    /^Equipo: se ha guardado otro desde entonces \(1 quitada\)\./,
  ]);
  await expectAccessible(page);
  const confirm = dialog.getByRole("button", { name: "Elegir la revisión 1" });
  await confirm.focus();
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveCount(0);
  await expect(chosenChip(page)).toBeFocused();
  await expect(chooseButton(page)).toHaveCount(0);
  await expectAccessible(page);

  // The scenario shows revision 1, its team with the DevOps engineer and its cost, locked.
  await banner(page).getByRole("link", { name: "Abrir el escenario" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  await expect(page.getByText("Equipo bloqueado · muestra la revisión elegida")).toBeVisible();
  // The demo's Plan A with its DevOps engineer: revision 1's total cost, not the team saved since.
  await expect(rail(page)).toContainText("Subtotal Coste total136.644 €");
  await expect(revisionLines(page).first()).toContainText("Elegida");

  // Unchosen, the team saved since comes back, without the DevOps engineer.
  await page.goto(`${new URL(page.url()).pathname}?view=tree`);
  await expectHydrated(banner(page).getByRole("button", { name: "Quitar la elección" }));
  await expect(node(page, "DevOps engineer")).toBeVisible();
  await banner(page).getByRole("button", { name: "Quitar la elección" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Quitar la elección" }).click();
  await expect(node(page, "Project manager")).toBeVisible();
  await expect(node(page, "DevOps engineer")).toHaveCount(0);
});

test("a member reads that the demo's delivery revision is the chosen one, with nothing to choose", async ({
  page,
  signInAs,
}) => {
  const member = await signInAs("member");
  await page.goto(`/revisions/${copyId(DELIVERY_REVISION, member.organizationId)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
  await expect(chosenChip(page)).toBeVisible();
  await expect(chooseButton(page)).toHaveCount(0);
});

test("a viewer, or a page without rate access, is not offered to choose a revision", async ({
  page,
  signInAs,
}) => {
  const viewer = await signInAs("viewer");
  const revision = copyId(DELIVERY_REVISION, viewer.organizationId);
  await page.goto(`/revisions/${revision}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
  // Who chose is open data: the viewer reads that it is the chosen one.
  await expect(chosenChip(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Elegir esta revisión" })).toHaveCount(0);
  await expectAccessible(page);
});
