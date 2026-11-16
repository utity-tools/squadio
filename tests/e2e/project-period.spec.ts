import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Planned period": the demo's Internal tooling plans 1 April to 31 December 2027,
// and a new assignment in its scenario spans that period, not the team's 1 April to 29 September:
// it then spans the whole project, which grows to the period, and the team keeps its own dates.
// Setting the period is the project form's, for a signed-in member, whom E2E never is: unit and
// database tests cover the form, and the demo seed sets this one. Its first save makes a visitor
// copy, as in team-editing.spec.ts. Needs the demo organization.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TOOLING = demoId(102);
const FIRST_DRAFT = demoId(204);

const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });
const dialog = (page: Page) => page.getByRole("dialog");
/** The header's definition of a term. */
const definition = (page: Page, term: string) =>
  page.getByRole("term").filter({ hasText: term }).locator("xpath=following-sibling::dd[1]");

test("the project page shows the planned period and the description to everyone", async ({
  page,
}) => {
  for (const access of ["", "?access=none"]) {
    await page.goto(`/projects/${TOOLING}${access}`);

    const header = page.getByRole("main");
    await expect(definition(page, "Periodo previsto")).toHaveText(/^1 abr\s–\s31 dic 2027$/);
    await expect(header).toContainText("Internal tools for the delivery teams");
  }
});

test("speaks English under /en", async ({ page }) => {
  await page.goto(`/en/projects/${TOOLING}`);

  await expect(definition(page, "Planned period")).toHaveText(/^Apr 1\s–\s+Dec 31, 2027$/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a new assignment spans the planned period, by the keyboard, in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/projects/${TOOLING}`);
    await expect(definition(page, "Periodo previsto")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(`/scenarios/${FIRST_DRAFT}?view=table`);
    // The one assignment spans the whole project, 1 April to 29 September.
    await expect(row(page, "Developer")).toContainText("Todo el proyecto");
    const span = page.getByRole("term").filter({ hasText: "Duración del proyecto" }).locator("..");
    await expect(span).toContainText(/1 abr\s–\s29 sept 2027/);
    const add = page.getByRole("button", { name: "Añadir al equipo…" });
    await expectHydrated(add);
    await page
      .getByRole("radiogroup", { name: "Vista" })
      .getByRole("radio", { checked: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(dialog(page)).toHaveAccessibleName("Añadir al equipo");
    const who = dialog(page).getByRole("combobox", { name: "Persona o vacante" });
    await expect(who).toBeFocused();
    await who.selectOption({ label: "Vacante de Senior Developer" });
    await page.keyboard.press("Tab");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Tooling lead");
    await expectNoAxeViolations(page);
    await page.keyboard.press("Enter");

    await expect(dialog(page)).toHaveCount(0);
    await expect(row(page, "Tooling lead")).toContainText("Todo el proyecto");
    await expect(span).toContainText(/1 abr\s–\s31 dic 2027/);
    // The team keeps its own dates: the period never moves an assignment.
    await expect(row(page, "Developer")).toContainText(/1 abr\s–\s29 sept 2027/);
    await expect(
      page.getByRole("region", { name: "Datos del escenario" }).getByText("Guardado"),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
