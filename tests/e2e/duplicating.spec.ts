import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Duplicating a scenario": «Duplicar» makes a draft copy of a scenario, with its
// team and extra costs, and opens it in the editor; with rate access only. The demo template is
// never written, so a visitor's first duplicate makes their copy, as a first save does (ADR 0011).
// Needs the demo organization (`pnpm db:migrate` and `pnpm db:seed`). Each test has its own browser
// context, so its own copy.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PORTAL = demoId(100);
const GUIDE_SCENARIO = demoId(200);

const banner = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const rail = (page: Page) => page.getByRole("complementary", { name: "Resumen" });
const duplicateButton = (page: Page) => banner(page).getByRole("button", { name: "Duplicar" });

/** The figures the summary's rail shows, which a copy shares with its original. */
const figuresOf = async (page: Page) => {
  await expect(rail(page).getByText("Completo · 9 de 9 líneas")).toBeVisible();
  return (await rail(page).innerText()).replace(/\s+/g, " ");
};

async function openScenario(page: Page, scenarioId: string, query = "") {
  await page.goto(`/scenarios/${scenarioId}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectHydrated(banner(page).getByRole("button", { name: "Deshacer" }));
}

test("duplicating the guide scenario from its header opens a draft with the same figures", async ({
  page,
  context,
}) => {
  await openScenario(page, GUIDE_SCENARIO);
  const original = await figuresOf(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }

  await duplicateButton(page).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "Plan A (copia)" })).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(GUIDE_SCENARIO));
  expect(await context.cookies()).toContainEqual(expect.objectContaining({ httpOnly: true }));
  // A draft, whatever the original was, with the same team and extra costs.
  await expect(banner(page).getByRole("button", { name: "Elegir escenario" })).toBeVisible();
  expect(await figuresOf(page)).toBe(original.replace("Plan A", "Plan A (copia)"));

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }

  // The copy was saved in the visitor's copy, and the project lists it next to the original.
  const copy = page.url();
  await page.reload();
  expect(page.url()).toBe(copy);
  await expect(page.getByRole("heading", { level: 1, name: "Plan A (copia)" })).toBeVisible();
});

test("duplicating from the project's page names the copy after the ones it has", async ({
  page,
}) => {
  await page.goto(`/projects/${PORTAL}`);
  const table = page.getByRole("table", { name: "Escenarios" });
  await expectHydrated(table.getByRole("button", { name: "Duplicar Plan A" }));
  await expectNoAxeViolations(page);

  await table.getByRole("button", { name: "Duplicar Plan A" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan A (copia)" })).toBeVisible();

  // Back on the project, now the visitor's copy of it: a second copy is numbered.
  await page.goBack();
  await expect(table.getByRole("link", { name: "Plan A (copia)" })).toBeVisible();
  await expectHydrated(table.getByRole("button", { name: "Duplicar Plan A", exact: true }));
  await table.getByRole("button", { name: "Duplicar Plan A", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan A (copia 2)" })).toBeVisible();

  // Back again, the button that made it is ready, and a copy of a copy is numbered with Plan A.
  await page.goBack();
  await expect(table.getByRole("link", { name: "Plan A (copia 2)" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Duplicar Plan A", exact: true })).toHaveText(
    "Duplicar",
  );
  const ofCopy = table.getByRole("button", { name: "Duplicar Plan A (copia)", exact: true });
  await expectHydrated(ofCopy);
  await ofCopy.click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan A (copia 3)" })).toBeVisible();
});

test("without rate access nothing offers to duplicate", async ({ page }) => {
  await openScenario(page, GUIDE_SCENARIO, "?access=none");
  await expect(duplicateButton(page)).toHaveCount(0);

  await page.goto(`/projects/${PORTAL}?access=none`);
  await expect(page.getByRole("table", { name: "Escenarios" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Duplicar/ })).toHaveCount(0);
});
