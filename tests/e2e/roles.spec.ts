import type { Page } from "@playwright/test";

import { copyId } from "@/lib/visitors/copy-id";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";
import { expect, test } from "./support/signed-in";

// ADR 0015 and its amendment of 2026-11-23, signed in (ADR 0012, amendment of 2026-11-23): a
// viewer reads a scenario locked, with nothing to edit and no money; a member edits it; only the
// owner is offered the organization's deletion. Each test signs in an account of its own, in an
// organization of its own holding a copy of the demo's synthetic rows. Needs the demo organization
// (`pnpm db:migrate` and `pnpm db:seed`).

// The demo's guide scenario, a draft: the project manager has the tech lead under them.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

const details = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const tree = (page: Page) => page.getByRole("application", { name: "Árbol del equipo" });
const node = (page: Page, name: string) =>
  tree(page).getByRole("button", { name: new RegExp(`^${name}\\s*,`) });
const deleteOrganization = (page: Page) =>
  page.getByRole("button", { name: "Borrar la organización…" });
const deleteAccount = (page: Page) => page.getByRole("button", { name: "Borrar tu cuenta…" });

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

/** Opens the organization's copy of the guide scenario as a tree, hydrated. */
async function openGuide(page: Page, organizationId: string) {
  await page.goto(`/scenarios/${copyId(GUIDE_SCENARIO, organizationId)}?view=tree`);
  await expect(node(page, "Project manager")).toBeVisible();
  await expectHydrated(node(page, "Project manager"));
}

test("a viewer reads a scenario locked, with nothing to edit and no money", async ({
  page,
  signInAs,
}) => {
  const viewer = await signInAs("viewer");

  await openGuide(page, viewer.organizationId);

  await expect(page.getByText("Solo lectura · tu rol es de lector")).toBeVisible();
  await expect(node(page, "Tech lead")).toBeVisible();
  // Nothing to do but hide the card's panel (ADR 0017).
  await expect(details(page).getByRole("button")).toHaveText([""]);
  await expect(details(page).getByRole("button", { name: "Ocultar el panel" })).toBeVisible();
  await node(page, "Tech lead").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Quitar del equipo" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("€");
  await expectAccessible(page);
});

test("a member edits the scenario, and the edit is saved in their organization", async ({
  page,
  signInAs,
}) => {
  const member = await signInAs("member");
  await openGuide(page, member.organizationId);
  const scenario = page.url();
  await expect(page.getByRole("complementary", { name: "Resumen" })).toContainText("€");

  await node(page, "Tech lead").focus();
  await page.keyboard.press("Enter");
  const remove = page.getByRole("menu").getByRole("menuitem", { name: "Quitar del equipo" });
  await expect(page.getByRole("menu").getByRole("menuitem").first()).toBeFocused();
  // The menu moves focus a frame after each key: End goes straight to the last item.
  await page.keyboard.press("End");
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(node(page, "Tech lead")).toHaveCount(0);
  await expect(details(page).getByText("Guardado")).toBeVisible();

  // A member's scenario is the organization's own: no visitor's copy, and the edit stays.
  expect(page.url()).toBe(scenario);
  await page.reload();
  await expect(node(page, "Project manager")).toBeVisible();
  await expect(node(page, "Tech lead")).toHaveCount(0);
});

test("only the owner is offered the organization's deletion", async ({ page, signInAs }) => {
  await signInAs("owner");
  await page.goto("/organization");
  await expect(deleteOrganization(page)).toBeVisible();
  await expect(deleteAccount(page)).toBeVisible();
  await expectAccessible(page);
});

for (const role of ["member", "viewer"] as const) {
  test(`a ${role} can delete their account, not the organization`, async ({ page, signInAs }) => {
    await signInAs(role);
    await page.goto("/organization");
    await expect(deleteAccount(page)).toBeVisible();
    await expect(deleteOrganization(page)).toHaveCount(0);
    await expectAccessible(page);
  });
}
