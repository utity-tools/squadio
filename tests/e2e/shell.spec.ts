import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// The app shell of the design board "Navegación de la app": one 56 px top bar everywhere, and a
// sidebar that is open on the app's pages and folded to a 56 px icon rail in the scenario editor.
// Each place remembers the person's choice. Below lg (boards 28–30) a ☰ menu replaces the
// sidebar. Needs the demo organization for the scenario page.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const sidebarOf = (page: Page) => page.getByRole("navigation", { name: "Secciones" });
const widthOf = async (page: Page) =>
  (await sidebarOf(page).locator("..").boundingBox())?.width ?? 0;

test("the top bar is 56 px, with the logo leading home and the theme", async ({ page }) => {
  await page.goto("/");

  const bar = page.getByRole("banner");
  expect((await bar.boundingBox())?.height).toBe(56);
  await expect(bar.getByRole("link", { name: "Squadio, Inicio" })).toHaveAttribute("href", "/");
  await expect(bar.getByRole("radiogroup", { name: "Tema" })).toBeVisible();
});

test("the sidebar is open on Inicio, marks it, and folds to a rail it remembers", async ({
  page,
}) => {
  await page.goto("/");
  const home = sidebarOf(page).getByRole("link", { name: "Inicio" });
  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(home).toHaveCSS("font-weight", "600");
  await expect(home.getByText("Inicio")).toBeVisible();
  expect(await widthOf(page)).toBe(232);

  const fold = page.getByRole("button", { name: "Plegar la barra lateral" });
  await expectHydrated(fold);
  await fold.click();

  const unfold = page.getByRole("button", { name: "Desplegar la barra lateral" });
  await expect(unfold).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => widthOf(page)).toBe(56);
  expect((await home.boundingBox())?.width).toBe(40);

  // Remembered, and right from the first paint.
  await page.reload();
  expect(await widthOf(page)).toBe(56);
  await expect(page.getByRole("button", { name: "Desplegar la barra lateral" })).toBeVisible();
});

test("the scenario editor starts with the rail, a tooltip on each icon and the trail", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();

  expect(await widthOf(page)).toBe(56);
  const home = sidebarOf(page).getByRole("link", { name: "Inicio" });
  await expectHydrated(page.getByRole("button", { name: "Desplegar la barra lateral" }));
  await home.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Inicio");

  const trail = page.getByRole("banner").getByRole("navigation", { name: "Ruta de navegación" });
  await expect(trail.getByText("Plan A")).toHaveAttribute("aria-current", "page");
});

test("the editor's choice is its own: unfolding there leaves Inicio as it was", async ({
  page,
}) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  const unfold = page.getByRole("button", { name: "Desplegar la barra lateral" });
  await expectHydrated(unfold);
  await unfold.click();
  await expect.poll(() => widthOf(page)).toBe(232);

  await page.goto("/");
  expect(await widthOf(page)).toBe(232);
  await page.goto(`/scenarios/${GUIDE_SCENARIO}`);
  await expect(page.getByRole("heading", { level: 1, name: "Plan A" })).toBeVisible();
  expect(await widthOf(page)).toBe(232);
});

for (const viewport of [
  { name: "a phone", width: 390, height: 844 },
  { name: "an iPad held upright", width: 820, height: 1180 },
]) {
  test(`on ${viewport.name} the ☰ menu replaces the sidebar, the theme and the account`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(sidebarOf(page)).toBeHidden();
    const bar = page.getByRole("banner");
    await expect(bar.getByRole("radiogroup", { name: "Tema" })).toBeHidden();
    expect((await bar.boundingBox())?.height).toBe(56);

    const open = bar.getByRole("button", { name: "Abrir el menú" });
    await expectHydrated(open);
    expect(await open.boundingBox()).toMatchObject({ width: 44, height: 44 });
    await open.click();

    const panel = page.getByRole("dialog", { name: "Menú" });
    const home = panel.getByRole("navigation", { name: "Secciones" }).getByRole("link", {
      name: "Inicio",
    });
    await expect(home).toHaveAttribute("aria-current", "page");
    expect((await home.boundingBox())?.height).toBe(44);
    await expect(panel.getByRole("radiogroup", { name: "Tema" })).toBeVisible();

    // A modal dialog: the focus stays inside, Escape closes it and the focus goes back.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await expect(panel.locator(":focus")).toHaveCount(1);
    }
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(open).toBeFocused();
  });
}

test("from lg the sidebar is back and the ☰ menu is gone", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");

  await expect(sidebarOf(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir el menú" })).toBeHidden();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const state of ["open", "folded"] as const) {
    test(`the shell has no accessibility violations, ${state}, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      if (state === "folded") {
        const fold = page.getByRole("button", { name: "Plegar la barra lateral" });
        await expectHydrated(fold);
        await fold.click();
        await expect.poll(() => widthOf(page)).toBe(56);
      }

      await expectNoAxeViolations(page);
    });
  }

  test(`the phone menu has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const open = page.getByRole("button", { name: "Abrir el menú" });
    await expectHydrated(open);
    await open.click();
    await expect(page.getByRole("dialog", { name: "Menú" })).toBeVisible();

    await expectNoAxeViolations(page);
  });
}
