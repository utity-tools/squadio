import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Choosing a scenario": with rate access, the header chooses a scenario after a
// dialog, which freezes its rates and locks its team, and unchooses it again. The demo template is
// never chosen, so the first choice makes the visitor's copy, as a first save does (ADR 0011).
// Needs the demo organization (`pnpm db:migrate` and `pnpm db:seed`). Each test has its own browser
// context, so its own copy.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";
/** Chosen in the seed: the mobile app's delivery plan. */
const DELIVERY_SCENARIO = "6d656d6f-0000-4000-8000-000000000205";
/** The data platform: its Data Engineer category has no rate. */
const MISSING_RATE_SCENARIO = "6d656d6f-0000-4000-8000-000000000203";

const banner = (page: Page) => page.getByRole("banner");
const dialog = (page: Page) => page.getByRole("dialog");
const chooseButton = (page: Page) => banner(page).getByRole("button", { name: "Elegir escenario" });
const unchooseButton = (page: Page) =>
  banner(page).getByRole("button", { name: "Quitar la elección" });
const addButton = (page: Page) => page.getByRole("button", { name: "Añadir al equipo…" });

/** Opens a scenario's table, hydrated. */
async function open(page: Page, scenarioId: string, query = "") {
  await page.goto(`/scenarios/${scenarioId}?view=table${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectHydrated(banner(page).getByRole("button", { name: "Deshacer" }));
}

test("choosing the guide scenario makes the copy and locks its team", async ({ page, context }) => {
  await open(page, GUIDE_SCENARIO);
  await expect(addButton(page)).toBeVisible();

  await chooseButton(page).click();
  await expect(dialog(page)).toHaveAccessibleName("¿Elegir «Plan A»?");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
  await dialog(page).getByRole("button", { name: "Elegir escenario" }).click();

  await expect(page).not.toHaveURL(new RegExp(GUIDE_SCENARIO));
  await expect(dialog(page)).toHaveCount(0);
  expect(await context.cookies()).toContainEqual(expect.objectContaining({ httpOnly: true }));
  await expect(banner(page).getByText("Elegido", { exact: true })).toBeVisible();
  // The focus comes back to the button on the copy's page, and a status says the choice was made.
  await expect(unchooseButton(page)).toBeFocused();
  await expect(
    banner(page).getByRole("status").filter({ hasText: "Se ha elegido «Plan A»." }),
  ).toHaveCount(1);
  await expect(addButton(page)).toHaveCount(0);
  await expect(banner(page).getByRole("button", { name: "Deshacer" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }

  // The choice was saved in the copy.
  const copy = page.url();
  await page.reload();
  expect(page.url()).toBe(copy);
  await expect(banner(page).getByText("Elegido", { exact: true })).toBeVisible();
});

test("unchoosing a chosen scenario of the demo, from the keyboard, unlocks its team", async ({
  page,
}) => {
  await open(page, DELIVERY_SCENARIO);
  await expect(addButton(page)).toHaveCount(0);

  await unchooseButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveAccessibleName("¿Quitar la elección de «Delivery plan»?");
  const confirm = dialog(page).getByRole("button", { name: "Quitar la elección" });
  await confirm.focus();
  await page.keyboard.press("Enter");

  await expect(page).not.toHaveURL(new RegExp(DELIVERY_SCENARIO));
  await expect(chooseButton(page)).toBeFocused();
  await expect(banner(page).getByText("Elegido", { exact: true })).toHaveCount(0);
  await expect(addButton(page)).toBeVisible();
});

test("a team with a category without a rate cannot be chosen, and says why", async ({ page }) => {
  await open(page, MISSING_RATE_SCENARIO);
  await chooseButton(page).click();
  await expect(dialog(page)).toHaveAccessibleName(/^No se puede elegir «.+»$/);
  await expect(dialog(page)).toContainText("Falta la tarifa de Data Engineer");
  await expect(dialog(page).getByRole("button", { name: "Elegir escenario" })).toHaveCount(0);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
  await dialog(page).getByRole("button", { name: "Cerrar" }).click();
  await expect(chooseButton(page)).toBeFocused();
});

test("without rate access, nothing is offered", async ({ page }) => {
  await open(page, GUIDE_SCENARIO, "&access=none");
  await expect(addButton(page)).toBeVisible();
  await expect(chooseButton(page)).toHaveCount(0);
  await expect(unchooseButton(page)).toHaveCount(0);
});
