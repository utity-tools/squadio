import { screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import es from "../../../messages/es.json";

import {
  type InviteAction,
  type InvitationWithLink,
  InvitationsPanel,
  type RevokeAction,
} from "./invitations-panel";

const id = "0b5e0c1e-0000-4000-8000-000000000300";
const invitations: InvitationWithLink[] = [
  {
    id,
    email: "grace@squadio.example",
    role: "viewer",
    expiresAt: new Date("2026-11-30T10:00:00.000Z"),
    link: `https://squadio.example/invitations/${id}`,
  },
];

const invited: InviteAction = async () => ({ error: null, invitationId: id, values: null });
const revoked: RevokeAction = async () => ({ error: null });

function renderPanel(props: Partial<Parameters<typeof InvitationsPanel>[0]> = {}) {
  return renderWithIntl(
    <InvitationsPanel
      invitations={invitations}
      signUpOpen
      invite={invited}
      revoke={revoked}
      {...props}
    />,
  );
}

describe("InvitationsPanel, inviting", () => {
  it("sends the typed email and the chosen role", async () => {
    const user = userEvent.setup();
    const invite = vi.fn<InviteAction>(invited);
    renderPanel({ invite });

    await user.type(screen.getByRole("textbox", { name: "Email" }), "ada@squadio.example");
    await user.selectOptions(screen.getByRole("combobox", { name: "Rol" }), "Lector");
    await user.click(screen.getByRole("button", { name: "Crear la invitación" }));

    const sent = invite.mock.calls[0]?.[1];
    expect(sent?.get("email")).toBe("ada@squadio.example");
    expect(sent?.get("role")).toBe("viewer");
    expect(await screen.findByText(/Invitación creada/)).toHaveAttribute("role", "status");
  });

  it("offers a member or a viewer, a member by default, and never the owner", () => {
    renderPanel();

    const role = screen.getByRole("combobox", { name: "Rol" });
    expect(
      within(role)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Miembro", "Lector"]);
    expect(role).toHaveValue("member");
  });

  it("says why the email was refused, tied to the field", async () => {
    const user = userEvent.setup();
    renderPanel({
      invite: async () => ({
        error: "invalid",
        invitationId: null,
        values: { email: "ada@", role: "viewer" },
      }),
    });

    await user.click(screen.getByRole("button", { name: "Crear la invitación" }));

    const email = screen.getByRole("textbox", { name: "Email" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe un email válido.");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Escribe un email válido.");
  });

  it("keeps what was typed when it is refused, so nothing is typed twice", async () => {
    const user = userEvent.setup();
    renderPanel({
      invite: async () => ({
        error: "invalid",
        invitationId: null,
        values: { email: "ada@", role: "viewer" },
      }),
    });

    await user.click(screen.getByRole("button", { name: "Crear la invitación" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("ada@");
    expect(screen.getByRole("combobox", { name: "Rol" })).toHaveValue("viewer");
  });

  it("says the invitation was made only while it is still pending", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Crear la invitación" }));
    expect(await screen.findByText(/Invitación creada/)).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="es" messages={es} timeZone="Europe/Madrid">
        <InvitationsPanel invitations={[]} signUpOpen invite={invited} revoke={revoked} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(/Invitación creada/)).not.toBeInTheDocument();
  });

  it("points at the invitation already pending for the email", async () => {
    const user = userEvent.setup();
    renderPanel({ invite: async () => ({ error: "pending", invitationId: id, values: null }) });

    await user.click(screen.getByRole("button", { name: "Crear la invitación" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ya hay una invitación pendiente para ese email.");
    expect(within(alert).getByRole("link", { name: "Ver la invitación" })).toHaveAttribute(
      "href",
      `#invitation-${id}`,
    );
    expect(document.getElementById(`invitation-${id}`)).toHaveAttribute("data-highlighted");
  });

  it("says when the organization holds the most pending invitations", async () => {
    const user = userEvent.setup();
    renderPanel({ invite: async () => ({ error: "limit", invitationId: null, values: null }) });

    await user.click(screen.getByRole("button", { name: "Crear la invitación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hay 20 invitaciones pendientes");
    expect(screen.getByRole("textbox", { name: "Email" })).not.toHaveAttribute("aria-invalid");
  });
});

describe("InvitationsPanel, the pending invitations", () => {
  it("lists each with its email, role and expiry", () => {
    renderPanel();

    const list = screen.getByRole("region", { name: "Invitaciones pendientes" });
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("grace@squadio.example");
    expect(item).toHaveTextContent("Lector");
    expect(item).toHaveTextContent("Caduca el 30 nov 2026");
  });

  it("says when none is pending", () => {
    renderPanel({ invitations: [] });

    expect(screen.getByText("No hay invitaciones pendientes.")).toBeInTheDocument();
  });

  it("copies an invitation's link, and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    renderPanel();

    await user.click(
      screen.getByRole("button", {
        name: "Copiar el enlace de la invitación a grace@squadio.example",
      }),
    );

    expect(writeText).toHaveBeenCalledWith(`https://squadio.example/invitations/${id}`);
    // Said to a screen reader, and shown beside the button.
    await waitFor(() => expect(screen.getAllByText("Enlace copiado")).toHaveLength(2));
    const shown = screen.getAllByText("Enlace copiado").find((node) => !node.closest(".sr-only"));
    expect(shown).toBeVisible();
  });

  it("shows the link to select, and warns not to post it", () => {
    renderPanel();

    expect(screen.getByText(`https://squadio.example/invitations/${id}`)).toBeInTheDocument();
    expect(screen.getByText(/No publiques el enlace/)).toBeInTheDocument();
  });

  it("revokes an invitation by its id, and says why it could not", async () => {
    const user = userEvent.setup();
    const revoke = vi.fn<RevokeAction>(async () => ({ error: "not-found" }));
    renderPanel({ revoke });

    await user.click(
      screen.getByRole("button", { name: "Revocar la invitación a grace@squadio.example" }),
    );

    expect(revoke.mock.calls[0]?.[1].get("invitationId")).toBe(id);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esa invitación ya no está pendiente.",
    );
  });

  it("moves the focus to the list's heading once an invitation is revoked", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Revocar la invitación a grace@squadio.example" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Invitaciones pendientes" })).toHaveFocus(),
    );
  });

  it("says that only an existing account can accept while sign-up is closed, and only then", () => {
    const { unmount } = renderPanel({ signUpOpen: false });
    expect(screen.getByText(/solo puede aceptar alguien que ya tenga cuenta/)).toBeInTheDocument();

    unmount();
    renderPanel({ signUpOpen: true });
    expect(screen.queryByText(/ya tenga cuenta/)).not.toBeInTheDocument();
  });
});
