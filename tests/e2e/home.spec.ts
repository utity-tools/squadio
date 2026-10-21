import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

test("home page introduces Squadio in Spanish", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Squadio");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Squadio" })).toBeVisible();
  await expect(page.getByText(/Arma el equipo de un proyecto/)).toBeVisible();
});

test("home page speaks English under /en", async ({ page }) => {
  await page.goto("/en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText(/Build a project team/)).toBeVisible();
});

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

for (const path of ["/", "/en", "/no-such-page"]) {
  test(`${path} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path);

    await expectNoAxeViolations(page);
  });
}
