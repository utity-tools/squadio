import type { Page } from "@playwright/test";

import { copyId } from "@/lib/visitors/copy-id";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";
import { expect, test } from "./support/signed-in";

// ADR 0015 and its amendment of 2026-11-23 (slice 4c), signed in (ADR 0012, amendment of
// 2026-11-23): on the members page the owner makes a member a viewer, who then reads the
// organization's scenarios locked, and removes a member, who then finds no organization. Nobody but
// the owner is offered either. The member and the viewer join the owner's organization, which holds
// a copy of the demo's synthetic rows. Needs the demo organization (`pnpm db:migrate` and
// `pnpm db:seed`).

// The demo's guide scenario, a draft.
const GUIDE_SCENARIO = "6d656d6f-0000-4000-8000-000000000200";

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

const membersList = (page: Page) =>
  page.getByRole("region", { name: "Quién está en la organización" });
const row = (page: Page, name: string) =>
  membersList(page).getByRole("listitem").filter({ hasText: name });

test("the owner makes a member a viewer, who then reads the organization locked", async ({
  page,
  browser,
  signInAs,
}) => {
  const owner = await signInAs("owner");
  const memberContext = await browser.newContext();
  try {
    await signInAs("member", { in: memberContext, into: owner });
    const memberPage = await memberContext.newPage();

    await page.goto("/organization/members");
    await expect(membersList(page).getByRole("listitem")).toHaveCount(2);
    // The owner's own row offers nothing.
    await expect(row(page, "Synthetic owner").getByRole("button")).toHaveCount(0);
    const makeViewer = page.getByRole("button", { name: "Hacer lector a Synthetic member" });
    await expectHydrated(makeViewer);
    await makeViewer.focus();
    await page.keyboard.press("Enter");

    await expect(row(page, "Synthetic member")).toContainText("Lector");
    await expect(membersList(page).getByRole("status")).toHaveText(
      "Synthetic member ahora tiene el rol Lector.",
    );
    // The same button, now offering the other role, keeps the focus.
    await expect(
      page.getByRole("button", { name: "Hacer miembro a Synthetic member" }),
    ).toBeFocused();
    await expectAccessible(page);

    // The member, now a viewer, reads the organization's scenario locked on their next request.
    await memberPage.goto(`/scenarios/${copyId(GUIDE_SCENARIO, owner.organizationId)}?view=tree`);
    await expect(memberPage.getByText("Solo lectura · tu rol es de lector")).toBeVisible();
    await expect(memberPage.locator("body")).not.toContainText("€");
    // And, not being the owner, is offered nothing on the members page.
    await memberPage.goto("/organization/members");
    await expect(membersList(memberPage).getByRole("listitem")).toHaveCount(2);
    await expect(membersList(memberPage).getByRole("button")).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});

test("the owner removes a viewer, who then finds no organization", async ({
  page,
  browser,
  signInAs,
}) => {
  const owner = await signInAs("owner");
  const viewerContext = await browser.newContext();
  try {
    await signInAs("viewer", { in: viewerContext, into: owner });
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto("/organization/members");
    await expect(membersList(viewerPage).getByRole("listitem")).toHaveCount(2);

    await page.goto("/organization/members");
    const remove = page.getByRole("button", {
      name: "Quitar a Synthetic viewer de la organización",
    });
    await expectHydrated(remove);
    await remove.click();
    const dialog = page.getByRole("alertdialog", { name: "¿Quitar a Synthetic viewer?" });
    await expect(dialog).toBeVisible();
    // It starts on Cancel, never on the removal, and Escape keeps the member.
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(remove).toBeFocused();

    await remove.click();
    await dialog.getByRole("button", { name: "Quitar" }).click();

    await expect(dialog).toBeHidden();
    await expect(membersList(page).getByRole("listitem")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Quién está en la organización" }),
    ).toBeFocused();
    await expect(membersList(page).getByRole("status")).toHaveText(
      "Synthetic viewer ya no está en la organización.",
    );
    await expectAccessible(page);

    // On their next request the removed account has no organization: it is offered to start one.
    await viewerPage.goto("/organization");
    await expect(
      viewerPage.getByRole("heading", { name: "Empieza tu organización" }),
    ).toBeVisible();
  } finally {
    await viewerContext.close();
  }
});
