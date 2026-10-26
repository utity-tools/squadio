import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

test("follows the system theme by default, without hydration errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Sistema" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("a chosen theme applies at once and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await page.getByRole("radio", { name: "Oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // The theme script runs before the first paint: the very first HTML parse already has it.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Oscuro" })).toBeChecked();
});

test("the arrow keys choose a theme in the switch", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("radio", { name: "Sistema" }).focus();

  await page.keyboard.press("ArrowLeft");

  const dark = page.getByRole("radio", { name: "Oscuro" });
  await expect(dark).toBeChecked();
  await expect(dark).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in the ${colorScheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("the focused control shows a solid 2 px focus ring", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      // Tab until the switch has focus: `next dev` adds its own controls to the tab order.
      const focused = page.getByRole("radio", { name: "Sistema" });
      for (
        let tabs = 0;
        tabs < 5 && !(await focused.evaluate((el) => el === document.activeElement));
        tabs++
      ) {
        await page.keyboard.press("Tab");
      }
      await expect(focused).toBeFocused();

      const outline = await focused.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(outline).toEqual({ style: "solid", width: "2px" });
    });

    test("the home page has no accessibility violations", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      await expectNoAxeViolations(page);
    });

    test("the not-found page has no accessibility violations", async ({ page }) => {
      await page.goto("/no-such-page");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

      await expectNoAxeViolations(page);
    });
  });
}
