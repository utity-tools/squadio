import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// The project page: board 06's header, the organization's categories and costs with rate access,
// and the project's scenarios leading to the editor. A visitor, as here, reads the demo and writes
// nothing: adding a category or a scenario is for a signed-in member, whom E2E never is. Needs the
// demo organization.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PORTAL = demoId(100);
const RETAINER = demoId(101);
const TOOLING = demoId(102);
const MOBILE = demoId(103);
const GUIDE_SCENARIO = demoId(200);

const scenarios = (page: Page) => page.getByRole("table", { name: "Escenarios" });
const MONEY = /Cents\\*"\s*:/;

test("the projects list leads to a project's page, under Proyectos in the trail", async ({
  page,
}) => {
  await page.goto("/projects");
  await page
    .getByRole("table", { name: "Proyectos" })
    .getByRole("link", { name: "Customer portal" })
    .click();

  await expect(page).toHaveURL(`/projects/${PORTAL}`);
  await expect(page.getByRole("heading", { level: 1, name: "Customer portal" })).toBeVisible();
  // From lg the trail sits above the page, not in a top bar (ADR 0017).
  const trail = page.getByRole("navigation", { name: "Ruta de navegación" });
  await expect(trail.getByRole("link", { name: "Proyectos" })).toHaveAttribute("href", "/projects");
  await expect(trail.getByText("Customer portal")).toHaveAttribute("aria-current", "page");
  // Inside Proyectos, not its page: the section is current, not the page.
  await expect(
    page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Proyectos" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveTitle("Customer portal · Squadio");
});

test("names the client, the pricing model and the price, and offers no edits", async ({ page }) => {
  await page.goto(`/projects/${PORTAL}`);

  const main = page.getByRole("main");
  await expect(main).toContainText("Demo Client");
  await expect(main.getByText("Precio cerrado", { exact: true })).toBeVisible();
  await expect(main).toContainText(/200\.000\s€/);
  await expect(main).not.toContainText(/Editar proyecto|Crear escenario|Añadir categoría/);
  await expect(main.getByRole("button", { name: /Editar/ })).toHaveCount(0);
});

test("shows the organization's categories with their costs, read only", async ({ page }) => {
  await page.goto(`/projects/${PORTAL}`);

  const costs = page.getByRole("table", { name: "Categorías y costes" });
  await expect(costs.getByRole("columnheader")).toHaveText([
    /Categoría/,
    /Coste completo/,
    /Coste por hora/,
    /Tarifa de venta/,
    /Estado/,
  ]);
  const devOps = costs.getByRole("row", { name: /DevOps Engineer/ });
  await expect(devOps).toContainText(/68\.500\s€/);
  await expect(devOps).toContainText(/44,19\s€\/h/);
  await expect(devOps).toContainText(/62,00\s€\/h/);
  await expect(devOps).toContainText("Completa");
  // The demo's two DevOps engineers: their category's cost may reveal a salary (rule j).
  await expect(devOps).toContainText("Categoría pequeña");
  await expect(page.getByRole("main")).toContainText("solo hace falta para comparar");
});

test("lists the project's scenarios, each leading to the editor", async ({ page }) => {
  await page.goto(`/projects/${PORTAL}`);

  await expect(scenarios(page).getByRole("link")).toHaveText(["Plan A", "Plan B"]);
  await expect(scenarios(page).getByRole("columnheader")).toHaveText([
    // The ticks that pick scenarios to compare (docs/domain.md, "Comparing scenarios").
    "Comparar",
    "Escenario",
    "Equipo",
    "Horas efectivas",
    "Margen neto",
    "Estado",
    // «Duplicar», with rate access (docs/domain.md, "Duplicating a scenario").
    "Acciones",
  ]);
  await scenarios(page).getByRole("link", { name: "Plan A" }).click();

  await expect(page).toHaveURL(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
});

test("marks the chosen scenario, and says what each other project misses", async ({ page }) => {
  await page.goto(`/projects/${MOBILE}`);
  await expect(
    scenarios(page)
      // The project also holds the demo's alternative of it, a draft, so its rows start with
      // «Comparar».
      .getByRole("row", { name: /Delivery plan Elegido/ })
      .getByText("Elegido"),
  ).toBeVisible();

  await page.goto(`/projects/${TOOLING}`);
  await expect(page.getByRole("main").getByText("Falta el precio").first()).toBeVisible();

  await page.goto(`/projects/${RETAINER}`);
  await expect(page.getByRole("main")).toContainText(/Tope de 50\.000\s€/);
  await expect(
    page.getByRole("main").getByText("Tiempo y materiales", { exact: true }),
  ).toBeVisible();
});

test("without rate access shows the project and its scenarios, and no money", async ({ page }) => {
  const response = await page.goto(`/projects/${PORTAL}?access=none`);

  await expect(scenarios(page).getByRole("columnheader")).toHaveText([
    "Comparar",
    "Escenario",
    "Equipo",
    "Horas efectivas",
  ]);
  await expect(page.getByRole("main")).not.toContainText(/€|\d\s?%|Pendiente|Falta/);
  expect((await response?.text()) ?? "").not.toMatch(MONEY);
});

for (const [what, id] of [
  ["an id that is not a UUID", "portal"],
  ["a project that is not in the organization", demoId(999)],
]) {
  test(`${what} shows the not-found page, kept out of search engines`, async ({ page }) => {
    // As in the editor, the skeleton has streamed by the time the project turns out missing, so
    // the status stays 200 (Next.js, not-found.js); the noindex tag keeps it out of search engines.
    await page.goto(`/projects/${id}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  });
}

test("speaks English under /en", async ({ page }) => {
  await page.goto(`/en/projects/${PORTAL}`);

  await expect(page.getByRole("table", { name: "Scenarios" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Fixed price", { exact: true })).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const access of ["", "?access=none"]) {
    test(`the project page has no accessibility violations in the ${colorScheme} theme${access && " without rate access"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/projects/${PORTAL}${access}`);
      await expect(scenarios(page)).toBeVisible();

      await expectNoAxeViolations(page);
    });
  }
}
