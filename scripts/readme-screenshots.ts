import type { Page } from "@playwright/test";

import { expectOnCopy } from "../tests/e2e/support/copy";
import { expectHydrated } from "../tests/e2e/support/hydration";
import { expect, test } from "../tests/e2e/support/signed-in";

// The README's screenshots, in English, from the synthetic demo organization only. Each one
// waits for the page to settle, so a picture never catches a skeleton or a transition. The demo
// stays as the seed left it: the shots in `shots` only read, and the last two write to the local
// database alone, as the E2E tests do. The import signs in a synthetic account, deleted when its
// test ends; the example team empties Plan A in a visitor's copy of its own (ADR 0011), which
// stays until `pnpm db:clean-up` deletes it, and refuses a server that is not local.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PORTAL = demoId(100);
const PLAN_A = demoId(200);
const PLAN_B = demoId(201);
const MISSING_PRICE = demoId(204);
const DELIVERY_PLAN = demoId(205);
const DELIVERY_REVISION = demoId(500);

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
    file: "revision-light.png",
    path: `/en/revisions/${DELIVERY_REVISION}`,
    colorScheme: "light",
    ready: async (page) => expect(heading(page)).toBeVisible(),
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

async function settle(page: Page, file: string) {
  await page.evaluate(() => document.fonts.ready);
  // React Flow fits the tree and Motion counts the totals up after the first paint.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `docs/images/${file}` });
}

async function open(page: Page, path: string, colorScheme: Shot["colorScheme"]) {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
}

for (const shot of shots) {
  test(shot.file, async ({ page }) => {
    await open(page, shot.path, shot.colorScheme);
    await shot.ready(page);
    await settle(page, shot.file);
  });
}

// ADR 0016, board 12: the review of a categories file, with one cell to fix. «Data Engineer» is in
// the demo without a rate, so its row updates it; «UX Designer» has a social security above 100 %.
const CATEGORIES_FILE = [
  "categoria;salario_bruto_anual;seguridad_social_pct;otros_costes_anuales;tarifa_venta_hora;coste_hora_manual",
  "QA Engineer;38.000;;;45;",
  "Data Engineer;60.000;31;3.000;80;",
  "UX Designer;40.000;131;3.000;55;",
].join("\n");

test("import-light.png", async ({ page, signInAs }) => {
  await signInAs("member");
  await open(page, "/en/import", "light");
  const main = page.getByRole("main");
  await expectHydrated(main.getByRole("button", { name: "Continue" }));
  await page.getByLabel("CSV file of categories and costs").setInputFiles({
    name: "costs_2027.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CATEGORIES_FILE),
  });
  await main.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Match your columns" })).toBeFocused();
  await main.getByRole("button", { name: "Review 3 rows" }).click();
  await expect(page.getByRole("heading", { name: "Review the rows" })).toBeFocused();
  await expect(page.getByRole("row", { name: /UX Designer/ })).toBeVisible();
  await settle(page, "import-light.png");
});

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// docs/domain.md, "Starting from an example team" (board 15): the picker on Plan A's team, emptied
// from the keyboard. The first removal saves the visitor's copy and the page moves to it.
test("example-team-dark.png", async ({ page, baseURL }) => {
  // It saves through the server it opens: only ever a local one.
  if (!baseURL || !LOCAL_HOSTS.has(new URL(baseURL).hostname)) {
    throw new Error("The example-team shot saves a visitor's copy: run it against a local server.");
  }
  await open(page, `/en/scenarios/${PLAN_A}?view=tree`, "dark");
  const tree = page.getByRole("application", { name: "Team tree" });
  const node = (name: string) => tree.getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
  const remove = async (name: string) => {
    await node(name).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu").getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("menu").getByRole("menuitem", { name: "Remove from the team" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(node(name)).toHaveCount(0);
  };
  await expectHydrated(node("Project manager"));
  await remove("Tech lead");
  await expectOnCopy(page, PLAN_A);
  await expectHydrated(node("Project manager"));
  for (const name of ["Frontend developer", "DevOps engineer", "Project manager"])
    await remove(name);
  await expect(
    page.getByRole("region", { name: "Scenario details" }).getByText("Saved"),
  ).toBeVisible();

  const start = page.getByRole("button", { name: "Start from an example" });
  await expectHydrated(start);
  await start.click();
  const dialog = page.getByRole("dialog", { name: "Start from an example team" });
  await dialog.getByRole("radio", { name: /Product with a platform/ }).check();
  await expect(dialog.getByRole("combobox", { name: "DevOps Engineer" })).toHaveValue(/.+/);
  await settle(page, "example-team-dark.png");
});
