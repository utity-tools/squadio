import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// Inicio at /home (boards 01 and 14, decisions of 2026-11-05): the demo organization at a glance.
// `/` is the public landing (home.spec.ts). Needs the demo organization.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MONEY = /Cents\\*"\s*:/;

const card = (page: Page, label: string) =>
  page.getByRole("main").locator('[data-slot="kpi"]').filter({ hasText: label });
const corrections = (page: Page) =>
  page.getByRole("region", { name: /^Correcciones pendientes · \d+$/ });

test("names the organization and today, and leads to the projects", async ({ page }) => {
  await page.goto("/home");

  await expect(page).toHaveTitle("Inicio · Squadio");
  await expect(page.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/Consultora Demo · \p{L}+, \d+ \p{L}+ \d{4}/u);
  await page.getByRole("link", { name: "Ver proyectos" }).click();
  await expect(page).toHaveURL("/projects");
});

test("counts the demo's projects, chosen scenarios, corrections and active people", async ({
  page,
}) => {
  await page.goto("/home");

  await expect(card(page, "Proyectos")).toContainText("5");
  await expect(card(page, "Con escenario elegido")).toContainText("2 de 5");
  await expect(card(page, "Correcciones pendientes")).toContainText("4");
  await expect(card(page, "Correcciones pendientes")).toHaveAttribute("data-pending", "true");
  await expect(card(page, "Personas activas")).toContainText("15");
});

test("lists the projects with their margins, and the corrections once each", async ({ page }) => {
  await page.goto("/home");

  const projects = page.getByRole("region", { name: "Proyectos" });
  await expect(projects.getByRole("table", { name: "Proyectos" }).getByRole("row")).toHaveCount(6);
  await expect(projects.getByRole("link", { name: "Ver todos" })).toHaveAttribute(
    "href",
    "/projects",
  );

  const items = corrections(page).getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("Coste de Data Engineer");
  await expect(items.nth(0)).toContainText("Support retainer › Data platform");
  await expect(items.nth(1)).toContainText("Tarifa de venta de Data Engineer");
  await expect(items.nth(2)).toContainText("Precio de Internal tooling");
  await expect(items.nth(3)).toContainText("Tope de presupuesto superado");

  await items
    .nth(2)
    .getByRole("link", { name: /^Abrir el proyecto/ })
    .click();
  await expect(page).toHaveURL(`/projects/${demoId(102)}`);
  await page.goBack();
  await corrections(page).getByRole("listitem").nth(0).getByRole("link").click();
  await expect(page).toHaveURL(`/scenarios/${demoId(203)}`);
});

test("shows today's occupancy of each category with active people", async ({ page }) => {
  await page.goto("/home");

  const occupancy = page.getByRole("region", { name: "Ocupación hoy por categoría" });
  await expect(occupancy.getByRole("listitem")).toHaveCount(5);
  await expect(occupancy).toContainText("Senior Developer");
  await expect(occupancy).not.toContainText("Data Engineer");
  await expect(occupancy.getByRole("listitem").first()).toContainText(/\d+\s%$/);
});

test("marks Inicio, which the logo leads to too", async ({ page }) => {
  await page.goto("/home");

  const home = page.getByRole("navigation", { name: "Secciones" }).getByRole("link", {
    name: "Inicio",
  });
  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(home).toHaveAttribute("href", "/home");
  await expect(page.getByRole("link", { name: "Squadio, Inicio" })).toHaveAttribute(
    "href",
    "/home",
  );
});

test("without rate access shows projects, people and occupancy, and no money", async ({ page }) => {
  const response = await page.goto("/home?access=none");

  await expect(card(page, "Proyectos")).toContainText("5");
  await expect(card(page, "Correcciones pendientes")).toHaveCount(0);
  await expect(corrections(page)).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Proyectos" }).getByRole("columnheader")).toHaveText(
    ["Proyecto", "Escenario"],
  );
  await expect(page.getByRole("region", { name: "Ocupación hoy por categoría" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/€|Pendiente|Falta|Aviso/);
  expect((await response?.text()) ?? "").not.toMatch(MONEY);
});

test("speaks English under /en", async ({ page }) => {
  await page.goto("/en/home");

  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pending corrections · 4" })).toContainText(
    "Cost of Data Engineer",
  );
});

test("on a phone the ☰ menu marks Inicio, and the page never scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const open = page.getByRole("button", { name: "Abrir el menú" });
  await expectHydrated(open);
  await open.click();
  await expect(
    page.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Inicio" }),
  ).toHaveAttribute("aria-current", "page");
});

test("the keyboard reaches the projects, the corrections and their links in order", async ({
  page,
}) => {
  await page.goto("/home");
  const seeProjects = page.getByRole("link", { name: "Ver proyectos" });
  await expectHydrated(seeProjects);
  await seeProjects.focus();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Ver todos" })).toBeFocused();
  // The table's scroller, so a narrow window can bring every column into view.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("group", { name: "Proyectos" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Customer portal" })).toBeFocused();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const access of ["", "?access=none"]) {
    test(`Inicio has no accessibility violations in the ${colorScheme} theme${access && " without rate access"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/home${access}`);
      await expect(page.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();

      await expectNoAxeViolations(page);
    });
  }
}
