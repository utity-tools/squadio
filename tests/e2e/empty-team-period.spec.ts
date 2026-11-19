import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectOnCopy } from "./support/copy";
import { expectHydrated } from "./support/hydration";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). Customer portal
// has no planned period, and Plan A's cloud is an undated recurring cost, so without a team it has
// no span to run over (docs/domain.md, rule d). The first removal saves a visitor copy and the page
// moves to it; each test has its own browser context, so its own copy.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const menu = (page: Page) => page.getByRole("menu");
const rail = (page: Page, name = "Resumen") => page.getByRole("complementary", { name });
const banner = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });

/** Removes an assignment with its menu, from the keyboard. */
async function remove(page: Page, name: string) {
  await node(page, name).focus();
  await page.keyboard.press("Enter");
  await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
  // The menu moves focus a frame after each key: End goes straight to the last item.
  await page.keyboard.press("End");
  await expect(menu(page).getByRole("menuitem", { name: "Quitar del equipo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(node(page, name)).toHaveCount(0);
}

/** Removes Plan A's whole team, the reports before their manager, and waits for the copy. */
async function emptyTheTeam(page: Page) {
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

for (const colorScheme of ["light", "dark"] as const) {
  test(`without a team the rail says how to give the cloud a span, in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await emptyTheTeam(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

    const warning = rail(page).getByRole("listitem");
    await expect(warning.getByRole("heading", { name: "Falta el periodo previsto" })).toBeVisible();
    await expect(warning).toContainText(
      "Fija el periodo previsto del proyecto o añade a alguien al equipo.",
    );
    await expect(rail(page).getByRole("region", { name: "Margen neto" })).toContainText(
      "Aparece en cuanto haya alguien en el equipo.",
    );
    await expectNoAxeViolations(page);

    if (colorScheme === "light") {
      // The copy's page, in English.
      await page.goto(`/en${new URL(page.url()).pathname}`);
      const english = rail(page, "Summary").getByRole("listitem");
      await expect(
        english.getByRole("heading", { name: "The planned period is missing" }),
      ).toBeVisible();
      await expect(english).toContainText(
        "Set the project's planned period or add someone to the team.",
      );
    }
  });
}
