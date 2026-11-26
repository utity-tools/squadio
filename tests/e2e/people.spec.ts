import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// The people page (board 07) as ADR 0017's list: the demo's people with their category, weekly
// hours and today's occupancy. Never a salary. With rate access, rule j marks the demo's DevOps
// Engineers, the only category with 2 active people. The search, tab, category and order live in
// the URL. Needs the demo organization.

const list = (page: Page) => page.getByRole("list", { name: "Personas" });
const person = (page: Page, name: string) =>
  list(page)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${name}`) });
const tabs = (page: Page) => page.getByRole("tablist", { name: "Filtrar personas" });

test("lists the demo's people and marks the small category", async ({ page }) => {
  await page.goto("/people");

  await expect(page.getByRole("heading", { level: 1, name: /^Personas/ })).toContainText(
    "15 personas",
  );
  await expect(tabs(page).getByRole("tab", { name: /^Activas/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const devOps = person(page, "DevOps Engineer 1");
  await expect(devOps).toContainText("DevOps Engineer");
  await expect(devOps).toContainText(/h\/sem/);
  await expect(devOps).toContainText(/\d+\s%\shoy/);
  await expect(devOps.getByText("Categoría pequeña", { exact: true })).toBeVisible();
  await expect(person(page, "Senior Developer 1").getByText(/Categoría pequeña/)).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("€");
});

test("searches, filters and orders, keeps it all in the URL, and Back undoes a tab", async ({
  page,
}) => {
  await page.goto("/people");
  const search = page.getByRole("searchbox", { name: "Buscar por nombre, categoría o área" });
  await expectHydrated(search);

  await search.fill("devops");
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
  await expect(page).toHaveURL("/people?q=devops");

  await tabs(page)
    .getByRole("tab", { name: /^Libres hoy/ })
    .click();
  await expect(page).toHaveURL("/people?q=devops&tab=free");
  await page.goBack();
  await expect(page).toHaveURL("/people?q=devops");
  await expect(tabs(page).getByRole("tab", { name: /^Activas/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // A link opens the list as it was left.
  await page.goto("/people?q=zzz");
  await expect(page.getByRole("heading", { name: "Ninguna persona coincide" })).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL("/people");
  await expect(list(page).getByRole("listitem").first()).toBeVisible();
});

test("offers a visitor no way to add or edit people: the demo is not theirs", async ({ page }) => {
  await page.goto("/people");

  await expect(list(page)).toBeVisible();
  // Only a signed-in member with rate access writes people; E2E never signs in, so unit and
  // database tests cover that side.
  await expect(page.getByRole("button", { name: /Añadir persona|Editar/ })).toHaveCount(0);
});

test("without rate access shows the people but not rule j's warning", async ({ page }) => {
  await page.goto("/people?access=none");

  await expect(person(page, "DevOps Engineer 1")).toBeVisible();
  await expect(list(page)).not.toContainText("Categoría pequeña");
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
    page
      .getByRole("list", { name: "People" })
      .getByRole("listitem")
      .filter({ hasText: /^DevOps Engineer 1/ }),
  ).toContainText("Small category");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the page has no accessibility violations in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/people");
    await expect(list(page)).toBeVisible();
    await expectNoAxeViolations(page);

    // Nor when the filters leave nothing.
    await page.goto("/people?q=zzz");
    await expect(page.getByRole("heading", { name: "Ninguna persona coincide" })).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
