import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";
import { scenarioCard } from "./support/scenario-card";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both).
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

test("a demo scenario opens with its bar, card, team and summary", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);

  await expect(page).toHaveTitle("Escenario · Squadio");
  // The card says what the scenario is, and leads to its project (ADR 0017).
  const card = scenarioCard(page);
  // The bar's name is the page's heading; the card is a group named after the scenario.
  const bar = page.getByRole("region", { name: "Datos del escenario" });
  await expect(bar.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Plan A" })).toBeVisible();
  await expect(card.getByText("Borrador", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "Customer portal" })).toHaveAttribute(
    "href",
    "/projects/6d656d6f-0000-4000-8000-000000000100",
  );
  await expect(card).toContainText(/Precio cerrado · 1 abr\s–\s29 sept 2027/);
  await expect(page.getByRole("navigation", { name: "Ruta de navegación" })).toBeHidden();
  // The bar says what to do: the status for choosing, and choosing.
  await expect(bar.getByRole("button", { name: /^Estado para elegir: / })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Elegir escenario" })).toBeVisible();
  await page.getByRole("tab", { name: "Detalles" }).click();
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
  await expect(page.getByRole("tab", { name: "Result" })).toBeVisible();
  await expect(scenarioCard(page)).toContainText(/Fixed price · /);
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

test("hiding the panel keeps the page's heading, and the status brings the card back", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  const bar = page.getByRole("region", { name: "Datos del escenario" });
  const hide = bar.getByRole("button", { name: "Ocultar el panel" });
  await expectHydrated(hide);
  await expect(hide).toHaveAttribute("aria-expanded", "true");

  await hide.click();
  await expect(page.getByRole("complementary", { name: "Resumen" })).toBeHidden();
  await expect(bar.getByRole("button", { name: "Mostrar el panel" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Árbol" })).toBeChecked();
  await expectNoAxeViolations(page);

  await bar.getByRole("button", { name: /^Estado para elegir: / }).click();
  await expect(page.getByRole("complementary", { name: "Resumen" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Plan A" })).toBeFocused();
});
