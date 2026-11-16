import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// The people page (board 07): the demo's people with their category, weekly hours and today's
// occupancy. Never a salary. With rate access, rule j marks the demo's DevOps Engineers, the only
// category with 2 active people. Needs the demo organization.

const table = (page: Page) => page.getByRole("table", { name: "Personas" });
const row = (page: Page, name: string) =>
  table(page).getByRole("row", { name: new RegExp(`^${name}`) });

test("lists the demo's people and marks the small category", async ({ page }) => {
  await page.goto("/people");

  await expect(page.getByRole("heading", { level: 1, name: /^Personas/ })).toContainText(
    "15 personas",
  );
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "Nombre",
    "Categoría",
    "Jornada",
    "Área",
    /Ocupación hoy/,
    "Estado",
  ]);
  const devOps = row(page, "DevOps Engineer 1");
  await expect(devOps).toContainText("DevOps Engineer");
  await expect(devOps).toContainText(/h\/sem/);
  await expect(devOps.getByText("Activa")).toBeVisible();
  await expect(devOps.getByText(/Categoría pequeña/)).toBeVisible();
  await expect(row(page, "Senior Developer 1").getByText(/Categoría pequeña/)).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("€");
});

test("offers a visitor no way to add or edit people: the demo is not theirs", async ({ page }) => {
  await page.goto("/people");

  await expect(table(page)).toBeVisible();
  // Only a signed-in member with rate access writes people; E2E never signs in, so unit and
  // database tests cover that side.
  await expect(page.getByRole("button", { name: /Añadir persona|Editar/ })).toHaveCount(0);
});

test("without rate access shows the people but not rule j's warning", async ({ page }) => {
  await page.goto("/people?access=none");

  await expect(row(page, "DevOps Engineer 1")).toBeVisible();
  await expect(table(page)).not.toContainText("Categoría pequeña");
});

test("marks Personas in the sidebar and speaks English under /en", async ({ page }) => {
  await page.goto("/people");
  const people = page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: "Personas" });
  await expect(people).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveTitle(/Personas/);

  await page.goto("/en/people");
  await expect(
    page.getByRole("table", { name: "People" }).getByRole("row", { name: /^DevOps Engineer 1/ }),
  ).toContainText("Small category");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the page has no accessibility violations in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/people");
    await expect(table(page)).toBeVisible();

    await expectNoAxeViolations(page);
  });
}
