import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { bench, raiseBench } from "./support/bench";
import { expectHydrated } from "./support/hydration";

// docs/domain.md, "Weekly load". Needs the demo organization. The seed anchors the ongoing chosen
// scenarios to the day it runs (docs/domain.md, "The demo's dates"): both cover today, and
// Senior Developer 4 leads the Mobile app's Delivery plan at 100% while reviewing Platform upkeep at
// 30%, so on the Delivery plan's page the weeks they share are over-allocated, whatever the date.
// The bench docks under the team from `lg`; Playwright's desktop viewport is 1280 px wide.

const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";
const DELIVERY_SCENARIO = "6d656d6f-0000-4000-8000-000000000205";

const benchCard = (page: Page, name: string) =>
  bench(page).locator("li[data-bench-person]").filter({ hasText: name });
const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });
const detail = /Por encima del 100\s% en \d+ semanas?: .*con Platform upkeep/;

/** Today in Madrid, `YYYY-MM-DD`, the day the seed anchored the ongoing scenarios to. */
const madridToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

test("the bench lists each person's weeks with their load, with the keyboard", async ({ page }) => {
  await page.goto(`/scenarios/${DELIVERY_SCENARIO}`);
  const card = benchCard(page, "Senior Developer 4");
  // Its name says what it does next: «Ver semanas», then «Ocultar semanas».
  const toggle = card.getByRole("button", {
    name: /^(Ver|Ocultar) semanas de Senior Developer 4$/,
  });
  await expectHydrated(toggle);
  await raiseBench(page);

  await expect(bench(page)).toContainText(
    "Carga por semana del escenario, según lo registrado en Squadio: una semana vacía no significa que la persona esté libre.",
  );
  await expect(card).toContainText(/\d+ semanas? por encima del 100\s%/);

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAccessibleName(/^Ocultar semanas de /);
  const weeks = card.getByRole("list", { name: "Carga semanal de Senior Developer 4" });
  await expect(
    weeks
      .getByRole("listitem")
      .filter({ hasText: /130\s%/ })
      .first(),
  ).toContainText("sobreasignación");
  await expect(bench(page)).not.toContainText("€");

  await page.keyboard.press("Enter");
  await expect(weeks).toHaveCount(0);
});

test("the team flags the over-allocated person with the weeks and projects, without rate access", async ({
  page,
}) => {
  for (const access of ["", "?access=none"]) {
    await page.goto(`/scenarios/${DELIVERY_SCENARIO}${access}`);
    await expect(node(page, "Tech lead")).toHaveAccessibleName(
      new RegExp(`Sobreasignación\\s*,\\s*${detail.source}`),
    );
    await expect(node(page, "Project manager")).not.toContainText("Sobreasignación");
  }

  // The table says how many weeks; a screen reader hears them all.
  await page.goto(`/scenarios/${DELIVERY_SCENARIO}?view=table`);
  await expect(
    row(page, "Tech lead").locator("[data-over-allocated] span[aria-hidden]"),
  ).toHaveText(/^\d+ semanas? por encima del 100\s%$/);
  await expect(row(page, "Tech lead")).toContainText(detail);
});

test("the flag follows an edit, which is still saved", async ({ page }) => {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=table`);
  const lead = row(page, "Tech lead");
  await expectHydrated(lead);
  await expect(lead).not.toContainText(/Por encima del 100\s%/);

  // Senior Developer 4 is busy with the ongoing projects today: leading from today overloads them.
  await lead.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu").getByRole("menuitem", { name: "Editar…" }).press("Enter");
  const dialog = page.getByRole("dialog");
  // Each option says how busy the person is today.
  const person = dialog.getByRole("option", { name: /^Senior Developer 4,/ });
  await dialog
    .getByRole("combobox", { name: "Persona o vacante" })
    .selectOption((await person.getAttribute("value")) ?? "");
  await dialog.getByLabel("Inicio").fill(madridToday());
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveCount(0);
  await expect(lead).toContainText(/Por encima del 100\s% en \d+ semanas?: .*con Mobile app/);
  await expect(
    page.getByRole("region", { name: "Datos del escenario" }).getByText("Guardado"),
  ).toBeVisible();
});

test("the flag shows on mobile, where the team is read-only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/scenarios/${DELIVERY_SCENARIO}`);
  await expect(page.getByText(detail).first()).toBeAttached();
  await expect(bench(page)).toBeHidden();
});

test("the weekly load speaks English under /en", async ({ page }) => {
  await page.goto(`/en/scenarios/${DELIVERY_SCENARIO}?view=table`);
  await expect(
    page.getByRole("treegrid", { name: "Team table" }).getByRole("row", { name: /^Tech lead\s/ }),
  ).toContainText(/\d+ weeks? above 100%.*Above 100\s?% in \d+ weeks?: .*with Platform upkeep/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the weekly load has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/scenarios/${DELIVERY_SCENARIO}`);
    const toggle = benchCard(page, "Senior Developer 4").getByRole("button", {
      name: /^Ver semanas de /,
    });
    await expectHydrated(toggle);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await raiseBench(page);
    await toggle.click();
    await expectNoAxeViolations(page);

    await page.goto(`/scenarios/${DELIVERY_SCENARIO}?view=table`);
    await expect(row(page, "Tech lead")).toContainText(detail);
    await expectNoAxeViolations(page);
  });
}
