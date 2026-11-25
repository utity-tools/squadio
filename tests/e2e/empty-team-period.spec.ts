import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { emptyTheTeam } from "./support/empty-team";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). Customer portal
// has no planned period, and Plan A's cloud is an undated recurring cost, so without a team it has
// no span to run over (docs/domain.md, rule d).

const rail = (page: Page, name = "Resumen") => page.getByRole("complementary", { name });

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
