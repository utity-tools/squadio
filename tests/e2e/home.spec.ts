import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// The public landing at `/` (design "Landing"); the app's Inicio is at `/home`.

const TITLE = "Monta el equipo. Mira el margen. Antes de firmar.";
const GUIDE = /\/scenarios\/6d656d6f-0000-4000-8000-000000000200$/;

test("the landing says what Squadio is for, in Spanish", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Squadio");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText(/simulador de staffing para consultoras/)).toBeVisible();
});

test("headings are set in Plus Jakarta Sans and text in Geist (ADR 0014)", async ({ page }) => {
  await page.goto("/");

  const fontOf = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate((element) => getComputedStyle(element).fontFamily);
  expect(await fontOf(page.getByRole("heading", { level: 1 }))).toMatch(/^"?Plus Jakarta Sans/);
  expect(await fontOf(page.locator("body"))).toMatch(/^"?Geist/);
});

test("the landing's call leads to the demo's guide scenario", async ({ page }) => {
  // Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both).
  await page.goto("/");

  await page.getByRole("link", { name: "Probar la demo, sin cuenta" }).click();

  await expect(page).toHaveURL(GUIDE);
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
});

test("the header stays on top and leads to the demo from the keyboard", async ({ page }) => {
  await page.goto("/");
  const header = page.getByRole("banner");

  await page.mouse.wheel(0, 600);
  await expect(header).toBeInViewport();
  const demo = header.getByRole("link", { name: "Probar la demo", exact: true });
  await demo.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(GUIDE);
});

test("the header switches to English and back", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("banner").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the team. See the margin. Before you sign.",
    }),
  ).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "Español" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
});

test("«Entrar» leads to the sign-in page, which says sign-up is closed", async ({ page }) => {
  // E2E runs with sign-up off, as production does (ADR 0012).
  await page.goto("/");

  await page.getByRole("banner").getByRole("link", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Entrar en Squadio" })).toBeVisible();
  await expect(page.getByText(/Todavía no se puede entrar con una cuenta/)).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const [device, viewport] of [
    ["a desktop", { width: 1280, height: 800 }],
    ["a phone", { width: 390, height: 844 }],
  ] as const) {
    for (const path of ["/", "/en"]) {
      test(`${path} has no accessibility violations on ${device} in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

        await expectNoAxeViolations(page);
      });
    }
  }
}

test("an unknown path answers 404 with a localized page", async ({ page }) => {
  const response = await page.goto("/en/no-such-page");

  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("We couldn't find this page · Squadio");
  await expect(
    page.getByRole("heading", { level: 1, name: "We couldn't find this page" }),
  ).toBeVisible();
});

for (const path of ["/no-such-file.txt", "/api/no-such-route"]) {
  test(`${path}, which the proxy skips, answers 404 with the Spanish page`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(
      page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test("/no-such-page has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/no-such-page");

  await expectNoAxeViolations(page);
});
