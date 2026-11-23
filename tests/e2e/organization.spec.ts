import { expect, test } from "@playwright/test";

// ADR 0012: the organization page is for signed-in accounts. These tests check the signed-out side;
// roles.spec.ts signs accounts in, without GitHub or Google (amendment of 2026-11-23).

test("sends a visitor without an account to the sign-in page", async ({ page }) => {
  await page.goto("/organization");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Entrar en Squadio" })).toBeVisible();
});

test("does the same under /en", async ({ page }) => {
  await page.goto("/en/organization");

  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to Squadio" })).toBeVisible();
});
