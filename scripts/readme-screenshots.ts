import { type Page, expect, test } from "@playwright/test";

// The README's screenshots, in English, from the synthetic demo organization only. Each one
// waits for the page to settle, so a picture never catches a skeleton or a transition. Read-only:
// nothing here saves, so the demo stays as the seed left it.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PORTAL = demoId(100);
const PLAN_A = demoId(200);
const PLAN_B = demoId(201);
const MISSING_PRICE = demoId(204);
const DELIVERY_PLAN = demoId(205);

type Shot = {
  file: string;
  path: string;
  colorScheme: "light" | "dark";
  /** What must be on the page before the picture is taken. */
  ready: (page: Page) => Promise<void>;
};

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

const shots: Shot[] = [
  {
    file: "editor-light.png",
    path: `/en/scenarios/${PLAN_A}`,
    colorScheme: "light",
    ready: async (page) => {
      await expect(page.getByRole("application", { name: "Team tree" })).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Bench" })).toBeVisible();
    },
  },
  {
    file: "inicio-light.png",
    path: "/en/home",
    colorScheme: "light",
    ready: async (page) => expect(heading(page)).toBeVisible(),
  },
  {
    file: "project-dark.png",
    path: `/en/projects/${PORTAL}`,
    colorScheme: "dark",
    ready: async (page) => expect(page.getByRole("table", { name: "Scenarios" })).toBeVisible(),
  },
  {
    file: "compare-light.png",
    path: `/en/projects/${PORTAL}/compare?s=${PLAN_A}&s=${PLAN_B}`,
    colorScheme: "light",
    ready: async (page) => expect(page.getByRole("table", { name: "Result" })).toBeVisible(),
  },
  {
    file: "over-allocation-dark.png",
    path: `/en/scenarios/${DELIVERY_PLAN}`,
    colorScheme: "dark",
    ready: async (page) => {
      await expect(page.getByRole("application", { name: "Team tree" })).toContainText(
        /above 100/i,
      );
      // The bench searched for the person behind the flag, with their strip of weeks. Their week
      // list stays closed: open, it fills the bench with the first weeks, not the overloaded ones.
      const bench = page.getByRole("complementary", { name: "Bench" });
      const people = bench.locator("li[data-bench-person]");
      await expect(people.first()).toBeVisible();
      await expect(async () => {
        await bench.getByPlaceholder("Search people").fill("Senior Developer 4");
        await expect(people).toHaveCount(1, { timeout: 1000 });
      }).toPass();
      await expect(people).toContainText(/weeks? above 100%/);
    },
  },
  {
    file: "partial-result.png",
    path: `/en/scenarios/${MISSING_PRICE}`,
    colorScheme: "light",
    ready: async (page) =>
      expect(page.getByRole("application", { name: "Team tree" })).toBeVisible(),
  },
  {
    file: "no-rate-access.png",
    path: `/en/scenarios/${PLAN_A}?access=none`,
    colorScheme: "light",
    ready: async (page) =>
      expect(page.getByRole("application", { name: "Team tree" })).toBeVisible(),
  },
];

for (const shot of shots) {
  test(shot.file, async ({ page }) => {
    await page.emulateMedia({ colorScheme: shot.colorScheme, reducedMotion: "reduce" });
    await page.goto(shot.path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", shot.colorScheme);
    await shot.ready(page);
    await page.evaluate(() => document.fonts.ready);
    // React Flow fits the tree and Motion counts the totals up after the first paint.
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `docs/images/${shot.file}` });
  });
}
