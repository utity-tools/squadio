import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// The projects list (board 05's page, in boards 01 and 14's table style): every project of the
// demo with the scenario that speaks for it and, with rate access, its margin and status
// (docs/domain.md, "A project's margin"). Needs the demo organization.

const table = (page: Page) => page.getByRole("table", { name: "Proyectos" });
const row = (page: Page, name: string) =>
  table(page).getByRole("row", { name: new RegExp(`^${name}`) });
/** Any money figure: every amount is a field in cents. */
const MONEY = /Cents\\*"\s*:/;

test("lists the demo's projects with their scenario, margin and status", async ({ page }) => {
  await page.goto("/projects");

  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "Proyecto",
    "Escenario",
    "Margen neto",
    "Estado",
  ]);
  await expect(table(page).getByRole("link")).toHaveText([
    "Customer portal",
    "Internal tooling",
    "Mobile app",
    "Platform upkeep",
    "Support retainer",
  ]);
  await expect(row(page, "Customer portal")).toContainText("Demo Client · Precio cerrado");
  await expect(row(page, "Customer portal")).toContainText("Sin elegir · 2 escenarios");
  await expect(row(page, "Customer portal")).not.toContainText("€");

  const mobile = row(page, "Mobile app");
  await expect(mobile).toContainText("Delivery plan");
  await expect(mobile.getByText("Elegido")).toBeVisible();
  await expect(mobile).toContainText(/€\s·\s[-−]?[\d,]+\s%/);
  await expect(
    mobile.locator('[data-tone="ok"], [data-tone="warn"], [data-tone="bad"]'),
  ).toHaveCount(1);

  const tooling = row(page, "Internal tooling");
  await expect(tooling).toContainText("First draft sin elegir");
  await expect(tooling.getByText("Pendiente")).toBeVisible();
  await expect(tooling).toContainText("Falta el precio");
  await expect(page.getByText("Los márgenes de proyectos distintos no se suman.")).toBeVisible();
});

test("marks Proyectos in the sidebar and names the page in the trail", async ({ page }) => {
  await page.goto("/projects");

  const projects = page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: "Proyectos" });
  await expect(projects).toHaveAttribute("aria-current", "page");
  await expect(projects).toHaveAttribute("href", "/projects");
  const trail = page.getByRole("banner").getByRole("navigation", { name: "Ruta de navegación" });
  await expect(trail.getByText("Proyectos")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveTitle(/Proyectos/);
});

test("without rate access lists projects and scenarios, and no money at all", async ({ page }) => {
  const response = await page.goto("/projects?access=none");

  await expect(table(page).getByRole("columnheader")).toHaveText(["Proyecto", "Escenario"]);
  await expect(row(page, "Mobile app").getByText("Elegido")).toBeVisible();
  await expect(table(page)).not.toContainText(/€|%|Pendiente|Falta/);
  await expect(
    page.getByText("Los márgenes los ven las personas con acceso a tarifas."),
  ).toBeVisible();
  const html = (await response?.text()) ?? "";
  expect(html).not.toMatch(MONEY);
  expect(html).not.toMatch(/BasisPoints\\*"\s*:/);
  await expect(page.getByRole("main")).not.toContainText(/€|\d\s?%/);
});

test("speaks English under /en", async ({ page }) => {
  await page.goto("/en/projects");

  const projects = page.getByRole("table", { name: "Projects" });
  await expect(projects.getByRole("row", { name: /^Customer portal/ })).toContainText(
    "Not chosen · 2 scenarios",
  );
  await expect(projects.getByRole("row", { name: /^Support retainer/ })).toContainText(
    "Demo Client · Time and materials",
  );
});

test("on a phone the ☰ menu offers Proyectos, marked, and the table scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");

  const open = page.getByRole("button", { name: "Abrir el menú" });
  await expectHydrated(open);
  await open.click();
  const panel = page.getByRole("dialog", { name: "Menú" });
  await expect(panel.getByRole("link", { name: "Proyectos" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");

  // The table keeps its columns and its scroller holds it: the page itself never scrolls sideways.
  const scroller = table(page).locator("..");
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const access of ["", "?access=none"]) {
    test(`the list has no accessibility violations in the ${colorScheme} theme${access && " without rate access"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/projects${access}`);
      await expect(table(page)).toBeVisible();

      await expectNoAxeViolations(page);
    });
  }
}
