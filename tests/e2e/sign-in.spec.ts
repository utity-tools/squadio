import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// E2E runs with sign-up off, as production does until the owner's processing review (ADR 0012).
// The open state, which needs GitHub or Google, is covered by unit and database tests.

test("with sign-up off, the sign-in page offers the demo and no provider", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page).toHaveTitle("Entrar · Squadio");
  await expect(page.getByRole("heading", { level: 1, name: "Entrar en Squadio" })).toBeVisible();
  await expect(page.getByText(/Todavía no se puede entrar con una cuenta/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Continuar con/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Probar la demo" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
});

test("with sign-up off, the home page does not invite signing in", async ({ page }) => {
  await page.goto("/en");

  await expect(page.getByRole("heading", { level: 1, name: "Squadio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("the sign-in page speaks English under /en", async ({ page }) => {
  await page.goto("/en/sign-in");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to Squadio" })).toBeVisible();
  await expect(page.getByText(/You can't sign in with an account yet/)).toBeVisible();
});

test("Better Auth answers under /api/auth, outside the locales", async ({ request }) => {
  const response = await request.get("/api/auth/ok");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

for (const path of ["/sign-in", "/en/sign-in"]) {
  test(`${path} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expectNoAxeViolations(page);
  });
}
