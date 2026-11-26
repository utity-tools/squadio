import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";

// docs/domain.md, "Comparing scenarios": the demo's Customer portal holds Plan A and Plan B, and a
// visitor ticks them on the project's page to see them side by side. Read-only, so the demo stays
// as it is. Needs the demo organization.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PORTAL = demoId(100);
const RETAINER = demoId(101);
const PLAN_A = demoId(200);
const PLAN_B = demoId(201);
const OTHER_PROJECT_SCENARIO = demoId(202);
const MONEY = /Cents\\*"\s*:/;

const compareUrl = (...ids: string[]) =>
  `/projects/${PORTAL}/compare?${ids.map((id) => `s=${id}`).join("&")}`;

/** Ticks Plan A and Plan B and compares them, with the keyboard only. */
async function pickBoth(page: Page) {
  const scenarios = page.getByRole("table", { name: "Escenarios" });
  for (const name of ["Plan A", "Plan B"]) {
    await scenarios.getByRole("checkbox", { name: `Comparar ${name}` }).focus();
    await page.keyboard.press("Space");
  }
  await page.getByRole("button", { name: "Comparar" }).focus();
  await page.keyboard.press("Enter");
}

test("ticking two scenarios with the keyboard compares them, the first picked as the baseline", async ({
  page,
}) => {
  await page.goto(`/projects/${PORTAL}`);
  await pickBoth(page);

  await expect(page).toHaveURL(compareUrl(PLAN_A, PLAN_B));
  await expect(
    page.getByRole("heading", { level: 1, name: "Comparar escenarios de Customer portal" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Comparar escenarios · Squadio");
  const result = page.getByRole("table", { name: "Resultado" });
  await expect(result.getByRole("columnheader")).toHaveText([
    "Línea",
    /^Plan A.*Referencia/,
    /^Plan B/,
  ]);
  // A fixed price: the effective rate is read first, and revenue does not move.
  await expect(result.getByRole("rowheader").first()).toHaveText("Tarifa efectiva");
  await expect(result.getByRole("row", { name: /^Ingresos/ })).toContainText("Sin cambio");
  await expect(page.getByRole("table", { name: "Personas" })).toContainText("Entra");
  // Each column leads to its scenario's editor; the trail leads back to the project.
  await expect(result.getByRole("link", { name: "Plan B" })).toHaveAttribute(
    "href",
    `/scenarios/${PLAN_B}`,
  );
  // From lg the trail sits above the page, not in a top bar (ADR 0017).
  const trail = page.getByRole("navigation", { name: "Ruta de navegación" });
  await expect(trail.getByRole("link", { name: "Customer portal" })).toHaveAttribute(
    "href",
    `/projects/${PORTAL}`,
  );

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
});

test("without rate access it compares teams and hours, never money", async ({ page }) => {
  await page.goto(`/projects/${PORTAL}?access=none`);
  const response = page.waitForResponse((r) => r.url().includes("/compare?"));
  await pickBoth(page);

  await expect(page).toHaveURL(`${compareUrl(PLAN_A, PLAN_B)}&access=none`);
  await expect(page.getByRole("table", { name: "Horas" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Resultado" })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/€|Margen|Pendiente/);
  expect(await (await response).text()).not.toMatch(MONEY);
  await expect(
    page.getByRole("table", { name: "Horas" }).getByRole("link", { name: "Plan A" }),
  ).toHaveAttribute("href", `/scenarios/${PLAN_A}?access=none`);
  await expectNoAxeViolations(page);
});

test("on a phone each table scrolls sideways, and the keyboard reaches it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(compareUrl(PLAN_A, PLAN_B));

  const scroller = page.getByRole("group", { name: "Resultado" });
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const overflows = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  // The line names stay in view while the columns scroll.
  await expect(scroller.getByRole("rowheader", { name: "Coste total" })).toBeInViewport();
  await expectNoAxeViolations(page);
});

test("asks for two or three scenarios when the link names one", async ({ page }) => {
  await page.goto(compareUrl(PLAN_A));

  await expect(page.getByRole("heading", { name: "Elige dos o tres escenarios" })).toBeVisible();
  await page.getByRole("link", { name: "Volver a Customer portal" }).click();
  await expect(page).toHaveURL(`/projects/${PORTAL}`);
});

for (const [what, url] of [
  ["a scenario of another project", compareUrl(PLAN_A, OTHER_PROJECT_SCENARIO)],
  ["the wrong project", `/projects/${RETAINER}/compare?s=${PLAN_A}&s=${PLAN_B}`],
  ["a project id that is not a UUID", `/projects/portal/compare?s=${PLAN_A}&s=${PLAN_B}`],
] as const) {
  test(`${what} shows the not-found page, kept out of search engines`, async ({ page }) => {
    // As on the project's page, the skeleton has streamed by the time the comparison turns out
    // missing, so the status stays 200 (Next.js, not-found.js); the noindex tag keeps it out.
    await page.goto(url);

    await expect(
      page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  });
}
