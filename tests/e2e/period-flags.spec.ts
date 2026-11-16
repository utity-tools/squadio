import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Planned period": a reference, never a limit. The demo's Internal tooling plans
// 1 April to 31 December 2027, and its First draft's one assignment ends on 29 September, so the
// team leaves 93 days of the period uncovered. An end moved past the period is flagged on its row
// and its node, never refused. Its first save makes a visitor copy, as in team-editing.spec.ts.
// Needs the demo organization.

const FIRST_DRAFT = "6d656d6f-0000-4000-8000-000000000204";

const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });
const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const menu = (page: Page) => page.getByRole("menu");
const dialog = (page: Page) => page.getByRole("dialog");
const uncovered = (page: Page) => page.getByText(/^El equipo .* del periodo previsto$/);

for (const colorScheme of ["light", "dark"] as const) {
  test(`the team flags what falls outside the planned period, by the keyboard, in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/scenarios/${FIRST_DRAFT}?view=table`);
    const developer = row(page, "Developer");
    await expect(developer).toBeVisible();
    await expectHydrated(developer);

    // The team ends on 29 September, the period on 31 December.
    await expect(uncovered(page)).toHaveText("El equipo acaba 93 días antes del periodo previsto");
    await expect(developer).not.toContainText("después del periodo previsto");
    await expectNoAxeViolations(page);

    // Tab from the view switch, past «Añadir al equipo…», to the row, and edit its end.
    await page
      .getByRole("radiogroup", { name: "Vista" })
      .getByRole("radio", { checked: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Añadir al equipo…" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(developer).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu(page).getByRole("menuitem", { name: "Editar…" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveAccessibleName(/^Editar Developer/);
    const end = dialog(page).getByLabel("Fin");
    await end.focus();
    await end.fill("2028-01-31");
    await page.keyboard.press("Enter");

    // Never refused: the row says how far outside it falls, and the team now covers the period.
    await expect(dialog(page)).toHaveCount(0);
    await expect(developer).toContainText("Acaba 31 días después del periodo previsto");
    await expect(uncovered(page)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Datos del escenario" }).getByText("Guardado"),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // The tree's node says it too, with the detail for a screen reader.
    await page
      .getByRole("radiogroup", { name: "Vista" })
      .getByRole("radio", { name: "Árbol" })
      .check();
    await expect(node(page, "Developer")).toHaveAccessibleName(
      /Fuera del periodo\s*,\s*Acaba 31 días después del periodo previsto/,
    );
    await expectNoAxeViolations(page);
  });
}

test("speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${FIRST_DRAFT}?view=table`);

  await expect(
    page.getByText("The team ends 93 days before the planned period does"),
  ).toBeVisible();
});
