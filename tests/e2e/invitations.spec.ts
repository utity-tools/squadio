import type { Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";
import { expect, test } from "./support/signed-in";

// ADR 0015 and its amendment of 2026-11-23 (slice 4b), signed in (ADR 0012, amendment of
// 2026-11-23): the owner invites an email from the members page and copies its link; only the
// invited account finds the invitation there, accepts it once and works in the organization.
// Signed out, or as anyone else, the link leads to the page not found. Each account has an
// organization of its own holding a copy of the demo's synthetic rows. Needs the demo organization
// (`pnpm db:migrate` and `pnpm db:seed`).

const OWNERS_ORGANIZATION = "Synthetic Consulting";

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

const inviteForm = (page: Page) => page.getByRole("region", { name: "Invitar a alguien" });
const pending = (page: Page) => page.getByRole("region", { name: "Invitaciones pendientes" });

/** Invites `email` with `role` from the members page, which must be open. */
async function invite(page: Page, email: string, role: "Miembro" | "Lector") {
  const form = inviteForm(page);
  await expectHydrated(form.getByRole("button", { name: "Crear la invitación" }));
  await form.getByRole("textbox", { name: "Email" }).fill(email);
  await form.getByRole("combobox", { name: "Rol" }).selectOption({ label: role });
  await form.getByRole("button", { name: "Crear la invitación" }).click();
}

test("the owner invites a viewer, who alone can accept the link, once", async ({
  page,
  browser,
  database,
  signInAs,
}) => {
  const owner = await signInAs("owner");
  await database.query(`update auth.organization set name = $1 where id = $2`, [
    OWNERS_ORGANIZATION,
    owner.organizationId,
  ]);
  const invitedContext = await browser.newContext();
  const otherContext = await browser.newContext();
  const signedOutContext = await browser.newContext();
  try {
    const invited = await signInAs("member", { in: invitedContext });
    await signInAs("member", { in: otherContext });

    // The owner opens the members page from the organization page.
    await page.goto("/organization");
    await page.getByRole("link", { name: "Ver los miembros" }).click();
    await expect(page).toHaveURL(/\/organization\/members$/);
    const members = page.getByRole("region", { name: "Quién está en la organización" });
    await expect(members.getByRole("listitem")).toHaveCount(1);
    await expect(members).toContainText("Synthetic owner (tú)");
    await expect(members).toContainText(owner.email);
    await expect(members).toContainText("Propietario");

    await invite(page, invited.email, "Lector");
    await expect(inviteForm(page).getByRole("status")).toHaveText(/Invitación creada/);
    const invitation = pending(page).getByRole("listitem");
    await expect(invitation).toContainText(invited.email);
    await expect(invitation).toContainText("Lector");
    const link = (await invitation.getByText(/\/invitations\//).textContent()) ?? "";
    const path = new URL(link).pathname;
    expect(path).toMatch(/^\/invitations\/[0-9a-f-]{36}$/);
    await expectAccessible(page);

    // A refused email stays typed, and a second invitation for the same email points at the first.
    await invite(page, "not-an-email", "Lector");
    await expect(inviteForm(page).getByRole("alert")).toContainText("Escribe un email válido.");
    await expect(inviteForm(page).getByRole("textbox", { name: "Email" })).toHaveValue(
      "not-an-email",
    );
    await expect(inviteForm(page).getByRole("combobox", { name: "Rol" })).toHaveValue("viewer");
    await invite(page, invited.email, "Miembro");
    const alert = inviteForm(page).getByRole("alert");
    await expect(alert).toContainText("Ya hay una invitación pendiente para ese email.");
    await expect(alert.getByRole("link", { name: "Ver la invitación" })).toBeVisible();
    await expect(pending(page).getByRole("listitem")).toHaveCount(1);

    // Signed out, and as another account, the link leads nowhere and names nothing.
    for (const context of [signedOutContext, otherContext]) {
      const stranger = await context.newPage();
      await stranger.goto(path);
      await expect(
        stranger.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
      ).toBeVisible();
      await expect(stranger.locator("body")).not.toContainText(OWNERS_ORGANIZATION);
      await expect(stranger.locator("body")).not.toContainText("Synthetic owner");
      await stranger.close();
    }

    // The invited account reads the invitation and accepts it.
    const guest = await invitedContext.newPage();
    await guest.goto(path);
    await expect(
      guest.getByRole("heading", { level: 1, name: `Te invitan a ${OWNERS_ORGANIZATION}` }),
    ).toBeVisible();
    await expect(guest.getByText("Synthetic owner te invita como lector.")).toBeVisible();
    await expectAccessible(guest);
    const accept = guest.getByRole("button", { name: "Aceptar la invitación" });
    await expectHydrated(accept);
    await accept.click();

    // It now works in the owner's organization, beside its own.
    await expect(guest).toHaveURL(/\/organization$/);
    await expect(guest.getByRole("heading", { level: 1, name: OWNERS_ORGANIZATION })).toBeVisible();
    const organizations = guest.getByRole("region", { name: "Tus organizaciones" });
    await expect(organizations.getByRole("listitem")).toHaveCount(2);
    await expectAccessible(guest);

    // As a viewer it sees the members' names and roles, without emails or invitations.
    await guest.goto("/organization/members");
    const seen = guest.getByRole("region", { name: "Quién está en la organización" });
    await expect(seen.getByRole("listitem")).toHaveCount(2);
    await expect(seen).toContainText("Synthetic member (tú)");
    await expect(seen).toContainText("Lector");
    await expect(guest.locator("main")).not.toContainText("@squadio.example");
    await expect(inviteForm(guest)).toHaveCount(0);
    await expectAccessible(guest);

    // The link works once.
    await guest.goto(path);
    await expect(guest.getByText("Ya se aceptó esta invitación.")).toBeVisible();
    await expect(guest.getByRole("button", { name: "Aceptar la invitación" })).toHaveCount(0);

    // And the account goes back to working in its own organization.
    await guest.goto("/organization");
    const own = guest
      .getByRole("region", { name: "Tus organizaciones" })
      .getByRole("button", { name: "Trabajar aquí: Synthetic organization" });
    await expectHydrated(own);
    await own.click();
    await expect(
      guest.getByRole("heading", { level: 1, name: "Synthetic organization" }),
    ).toBeVisible();
    // The button went away with the switch; the keyboard keeps its place on the list.
    await expect(guest.getByRole("heading", { name: "Tus organizaciones" })).toBeFocused();
  } finally {
    await Promise.all([invitedContext, otherContext, signedOutContext].map((c) => c.close()));
  }
});

test("the owner revokes a pending invitation", async ({ page, signInAs }) => {
  await signInAs("owner");
  await page.goto("/organization/members");

  await invite(page, `revoked-${crypto.randomUUID()}@squadio.example`, "Miembro");
  await expect(pending(page).getByRole("listitem")).toHaveCount(1);
  await expect(inviteForm(page).getByRole("status")).toHaveText(/Invitación creada/);
  const revoke = pending(page).getByRole("button", { name: /^Revocar la invitación a / });
  await revoke.click();

  await expect(pending(page).getByText("No hay invitaciones pendientes.")).toBeVisible();
  // Its button went away with it: the list's heading has the focus, and nothing says it was made.
  await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toBeFocused();
  await expect(inviteForm(page)).not.toContainText("Invitación creada");
  await expectAccessible(page);
});

test("a member sees the members without emails, and nothing to invite", async ({
  page,
  signInAs,
}) => {
  await signInAs("member");
  await page.goto("/organization/members");

  await expect(page.getByRole("region", { name: "Quién está en la organización" })).toContainText(
    "Synthetic member (tú)",
  );
  await expect(page.locator("main")).not.toContainText("@squadio.example");
  await expect(inviteForm(page)).toHaveCount(0);
  await expect(pending(page)).toHaveCount(0);
});
