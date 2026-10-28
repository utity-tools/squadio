import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both).
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

test("a demo scenario opens with its header, team and summary", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  await expect(page).toHaveTitle("Escenario · Squadio");
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  const breadcrumb = page.getByRole("navigation", { name: "Ruta de navegación" });
  await expect(breadcrumb.getByRole("listitem")).toHaveText([
    "Customer portal (Demo Client)",
    "Plan A",
  ]);
  await expect(page.getByText("Precio cerrado")).toBeVisible();
  await expect(page.getByText("130 días laborables")).toBeVisible();
  await expect(page.getByRole("main", { name: "Equipo" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Resumen" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Tema" })).toBeVisible();
});

test("the scenario page hydrates without errors, in both languages", async ({ page }) => {
  // The page is drawn again in the browser from the store (slice 3): any text the browser formats
  // differently from the server, such as a date range, is a hydration error.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const path of [`/scenarios/${GUIDE_SCENARIO}`, `/en/scenarios/${GUIDE_SCENARIO}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
    await expectHydrated(page.getByRole("heading", { level: 1, name: "Plan A" }));
  }
  expect(errors).toEqual([]);
});

test("the scenario page speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${GUIDE_SCENARIO}`);

  await expect(page.getByRole("main", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  await expect(page.getByText("Fixed price")).toBeVisible();
  await expect(page.getByText("130 working days")).toBeVisible();
});

for (const [what, id] of [
  ["an id that is not a UUID", "plan-a"],
  ["a scenario that is not in the organization", "00000000-0000-4000-8000-000000000000"],
]) {
  test(`${what} shows the not-found page, kept out of search engines`, async ({ page }) => {
    // The skeleton has streamed by the time the scenario turns out missing, so the status stays
    // 200 (Next.js, not-found.js); the noindex tag is what keeps the page out of search engines.
    await page.goto(`/scenarios/${id}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    await expectNoAxeViolations(page);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the scenario page has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
    // The heading is not in the skeleton: once it shows, the page has loaded.
    await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    // The view is chosen once the page hydrates, and its button's colours then change.
    await expect(page.getByRole("radio", { name: "Árbol" })).toBeChecked();

    await expectNoAxeViolations(page);
  });
}
