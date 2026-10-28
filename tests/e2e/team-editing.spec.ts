import { type Page, expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";

// Needs the demo organization: `pnpm db:migrate` and `pnpm db:seed` (CI does both). Every test
// edits the guide scenario, so its first save makes a visitor copy and the page moves to it; each
// test has its own browser context, so its own copy. Plan A: the project manager has the tech
// lead, the frontend developer and the DevOps open role under them.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const grid = (page: Page) => page.getByRole("treegrid", { name: "Tabla del equipo" });
/** A body row, by the role in its first cell. */
const row = (page: Page, title: string) =>
  grid(page).getByRole("row", { name: new RegExp(`^${title}\\s`) });
const menu = (page: Page) => page.getByRole("menu");
const dialog = (page: Page) => page.getByRole("dialog");

/** Opens the guide scenario and tabs from the view switch, past "Add to team…", into the view. */
async function tabIntoView(page: Page, view: "tree" | "table") {
  await page.goto(`/scenarios/${GUIDE_SCENARIO}?view=${view}`);
  const first = view === "tree" ? node(page, "Project manager") : row(page, "Project manager");
  await expect(first).toBeVisible();
  await expectHydrated(first);
  await page
    .getByRole("radiogroup", { name: "Vista" })
    .getByRole("radio", { checked: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Añadir al equipo…" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
}

/** Opens the focused node's or row's menu with Enter, and waits for its first item to take focus. */
async function openMenu(page: Page) {
  await page.keyboard.press("Enter");
  await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
}

/** Waits for the first save, which moves the page to the visitor's copy. */
async function expectSavedInCopy(page: Page) {
  await expect(page).not.toHaveURL(new RegExp(GUIDE_SCENARIO));
  await expect(page.getByRole("banner").getByText("Guardado")).toBeVisible();
}

test("an assignment is removed with the keyboard, and focus stays in the tree", async ({
  page,
}) => {
  await tabIntoView(page, "tree");
  await page.keyboard.press("ArrowDown");
  await expect(node(page, "Tech lead")).toBeFocused();

  await openMenu(page);
  await expect(menu(page)).toHaveAccessibleName(/^Acciones de Tech lead/);
  // The menu moves focus a frame after each arrow: wait for it before the next key.
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Añadir a su cargo…" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Mover a…" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Quitar del equipo" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(node(page, "Tech lead")).toHaveCount(0);
  await expect(node(page, "Project manager")).toBeFocused();
  // The first save moves the page to the copy; focus is still on the manager there.
  await expectSavedInCopy(page);
  await expect(node(page, "Project manager")).toBeFocused();

  // "Desktop Chrome" reports Windows, so the page takes Ctrl, whatever runs the test.
  await page.keyboard.press("Control+z");
  await expect(node(page, "Tech lead")).toBeFocused();
});

test("a person is added below a node with the keyboard", async ({ page }) => {
  await tabIntoView(page, "tree");
  await openMenu(page);
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Añadir a su cargo…" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(dialog(page)).toHaveAccessibleName("Añadir al equipo");
  const who = dialog(page).getByRole("combobox", { name: "Persona o vacante" });
  await expect(who).toBeFocused();
  await who.selectOption({ label: "Vacante de Senior Developer" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Backend developer");
  await page.keyboard.press("Enter");

  await expect(dialog(page)).toHaveCount(0);
  await expect(node(page, "Backend developer")).toBeFocused();
  await expect(node(page, "Backend developer")).toContainText("Vacante");
  await expectSavedInCopy(page);
  await expect(node(page, "Backend developer")).toBeFocused();
});

test("an assignment is moved from the table with the keyboard", async ({ page }) => {
  await tabIntoView(page, "table");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Frontend developer")).toBeFocused();

  await openMenu(page);
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Añadir a su cargo…" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Mover a…" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveAccessibleName(/^Mover Frontend developer/);
  const reportsTo = dialog(page).getByRole("combobox", { name: "Depende de" });
  // The dialog opens on its first field.
  await expect(reportsTo).toBeFocused();
  await reportsTo.selectOption({ label: "Tech lead (Senior Developer 1)" });
  // Enter on a select opens it on Windows and Linux: the keyboard goes on to the button.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Mover" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(row(page, "Frontend developer")).toBeFocused();
  await expect(row(page, "Frontend developer")).toHaveAttribute("aria-level", "3");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the menu and the dialogs have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await tabIntoView(page, "tree");
    await page.keyboard.press("ArrowDown");
    await expect(node(page, "Tech lead")).toBeFocused();
    await openMenu(page);
    await expect(menu(page)).toBeVisible();
    await expectNoAxeViolations(page);
    // The destructive item, focused, is the one with the least contrast.
    await page.keyboard.press("End");
    await expect(menu(page).getByRole("menuitem", { name: "Quitar del equipo" })).toBeFocused();
    await expectNoAxeViolations(page);

    await page.keyboard.press("ArrowUp");
    await expect(menu(page).getByRole("menuitem", { name: "Mover a…" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveAccessibleName(/^Mover Tech lead/);
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(node(page, "Tech lead")).toBeFocused();

    await openMenu(page);
    await page.keyboard.press("ArrowDown");
    await expect(menu(page).getByRole("menuitem", { name: "Añadir a su cargo…" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveAccessibleName("Añadir al equipo");
    // A form sent empty says what is missing.
    await dialog(page).getByRole("button", { name: "Añadir" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("Elige una persona o una vacante.");
    await expectNoAxeViolations(page);
  });
}
