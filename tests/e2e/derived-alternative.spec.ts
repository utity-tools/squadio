import type { Page } from "@playwright/test";

import { copyId } from "@/lib/visitors/copy-id";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";
import { expect, test } from "./support/signed-in";

// docs/domain.md, "Derived alternative", and ADR 0013: «Proponer alternativa» on a revision makes a
// new draft of its project from the revision's team and extra costs and opens it in the editor,
// which says where it came from and who proposed it. It needs rate access and a role that edits:
// a viewer and `?access=none` read the revision only. Visitors propose in their copy. Needs the
// demo organization (`pnpm db:migrate` and `pnpm db:seed`); each test has its own browser context,
// and each signed-in test an organization of its own.

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DELIVERY_REVISION = demoId(500);
const DELIVERY_ALTERNATIVE = demoId(207);

const details = (page: Page) => page.getByRole("region", { name: "Datos del escenario" });
const propose = (page: Page) =>
  details(page).getByRole("button", { name: /^Proponer alternativa$|^Proponiendo…$/ });
const origin = (page: Page) => details(page).getByRole("note");

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

/** Opens a revision's page, hydrated when it offers «Proponer alternativa». */
async function openRevision(page: Page, revisionId: string, query = "") {
  await page.goto(`/revisions/${revisionId}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
}

test("a member proposes an alternative from a revision and lands in its editor", async ({
  page,
  signInAs,
}) => {
  const member = await signInAs("member");
  const revision = copyId(DELIVERY_REVISION, member.organizationId);
  await openRevision(page, revision);
  await expectHydrated(propose(page));
  await expectAccessible(page);

  await propose(page).focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { level: 1, name: "Delivery plan (alternativa)" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/scenarios\/[0-9a-f-]{36}$/);
  await expect(origin(page)).toContainText(
    /^Alternativa de la revisión 1 de Delivery plan\W+propuesta por Synthetic member\W/,
  );
  // A draft, which the member edits and can choose.
  await expect(details(page).getByRole("button", { name: "Elegir escenario" })).toBeVisible();
  await expectAccessible(page);

  // The revision stays as it was, and the alternative links back to it.
  await origin(page).getByRole("link", { name: "revisión 1 de Delivery plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/revisions/${revision}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery plan · Revisión 1");
});

test("a viewer, or a page without rate access, is not offered an alternative", async ({
  page,
  signInAs,
}) => {
  const viewer = await signInAs("viewer");
  await openRevision(page, copyId(DELIVERY_REVISION, viewer.organizationId));
  await expect(details(page).getByRole("link", { name: "Abrir el escenario" })).toBeVisible();
  await expect(propose(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("€");
  await expectAccessible(page);
});

test("a member's page with ?access=none offers no alternative", async ({ page, signInAs }) => {
  const member = await signInAs("member");
  await openRevision(page, copyId(DELIVERY_REVISION, member.organizationId), "?access=none");
  await expect(details(page).getByRole("link", { name: "Abrir el escenario" })).toBeVisible();
  await expect(propose(page)).toHaveCount(0);
});

test("a visitor proposes an alternative of the demo's revision in their copy", async ({
  page,
  context,
}) => {
  await openRevision(page, DELIVERY_REVISION);
  await expectHydrated(propose(page));
  await propose(page).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Delivery plan (alternativa)" }),
  ).toBeVisible();
  expect(await context.cookies()).toContainEqual(expect.objectContaining({ httpOnly: true }));
  await expect(origin(page)).toContainText(
    /^Alternativa de la revisión 1 de Delivery plan\W+propuesta por visitante\W/,
  );
  // It links to the copy's revision, never the template's.
  await expect(origin(page).getByRole("link")).not.toHaveAttribute(
    "href",
    new RegExp(DELIVERY_REVISION),
  );
});

test("the demo's own alternative says where it came from", async ({ page }) => {
  await page.goto(`/scenarios/${DELIVERY_ALTERNATIVE}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Delivery plan (alternative)" }),
  ).toBeVisible();
  await expect(origin(page)).toContainText(
    /^Alternativa de la revisión 1 de Delivery plan\W+propuesta por visitante\W/,
  );
  await expect(origin(page).getByRole("link")).toHaveAttribute(
    "href",
    new RegExp(`/revisions/${DELIVERY_REVISION}$`),
  );
  await expectAccessible(page);
});
