import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { banner, emptyTheTeam, node, tree } from "./support/empty-team";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Starting from an example team" (board 15). Needs the demo organization:
// `pnpm db:migrate` and `pnpm db:seed` (CI does both). The demo has every category the examples
// name, so each role takes its own; Customer portal has no planned period, so they span next month.

/** One per open role: each node's actions button names it «(vacante)». */
const openRoles = (page: Page) =>
  tree(page).getByRole("button", { name: /^Acciones de .+ \(vacante\)$/ });
const picker = (page: Page) => page.getByRole("dialog", { name: "Partir de un equipo de ejemplo" });

for (const colorScheme of ["light", "dark"] as const) {
  test(`an empty team starts from an example team, undone in one step, in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await emptyTheTeam(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

    const open = page.getByRole("button", { name: "Partir de un ejemplo" });
    await expectHydrated(open);
    await open.click();
    const dialog = picker(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("todas ocupan el mes que viene");
    // A picker of structure only: no money reaches it.
    await expect(dialog).not.toContainText("€");

    await dialog.getByRole("radio", { name: /Producto con plataforma/ }).check();
    for (const role of ["Project Manager", "Frontend Developer", "DevOps Engineer"]) {
      await expect(dialog.getByRole("combobox", { name: role })).toHaveValue(/.+/);
    }
    await expectNoAxeViolations(page);

    await dialog.getByRole("button", { name: "Añadir 6 vacantes" }).click();
    await expect(dialog).toBeHidden();
    await expect(openRoles(page)).toHaveCount(6);
    await expect(node(page, "Project Manager")).toBeFocused();
    await expect(banner(page).getByText("Guardado")).toBeVisible();
    await expectNoAxeViolations(page);

    // Saved as the adds they are: the page loads them again.
    await page.reload();
    await expect(openRoles(page)).toHaveCount(6);
    await expectHydrated(node(page, "Project Manager"));
  });
}

test("one undo takes the whole example back", async ({ page }) => {
  await emptyTheTeam(page);
  const open = page.getByRole("button", { name: "Partir de un ejemplo" });
  await expectHydrated(open);
  await open.click();
  const dialog = picker(page);
  await dialog.getByRole("radio", { name: /Mantenimiento/ }).check();
  await dialog.getByRole("combobox", { name: "Junior Developer" }).selectOption("No añadir");
  await dialog.getByRole("button", { name: "Añadir 2 vacantes" }).click();
  await expect(openRoles(page)).toHaveCount(2);

  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(
    page.getByRole("heading", { name: "Este escenario aún no tiene equipo" }),
  ).toBeVisible();
  await expect(banner(page).getByText("Guardado")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Este escenario aún no tiene equipo" }),
  ).toBeVisible();
});

test("the picker speaks English on the English page", async ({ page }) => {
  await emptyTheTeam(page);
  await page.goto(`/en${new URL(page.url()).pathname}`);
  const open = page.getByRole("button", { name: "Start from an example" });
  await expectHydrated(open);
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Start from an example team" });
  await expect(dialog.getByRole("radio", { name: /Web application/ })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Add 5 open roles" })).toBeVisible();
});
