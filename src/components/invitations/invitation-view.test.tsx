import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { InvitationView as View } from "@/db/accept-invitation";
import { renderWithIntl } from "@/test/render";

import { type AcceptAction, InvitationView } from "./invitation-view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const id = "0b5e0c1e-0000-4000-8000-000000000300";
const invitation: View = {
  organizationName: "Synthetic Consulting",
  role: "viewer",
  inviterName: "Ada Synthetic",
  expiresAt: new Date("2026-11-30T10:00:00.000Z"),
  refusal: null,
};
const accepted: AcceptAction = async () => ({ error: null });

describe("InvitationView", () => {
  it("names the organization, who invites, the role and when it expires", () => {
    renderWithIntl(<InvitationView invitationId={id} invitation={invitation} accept={accepted} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Te invitan a Synthetic Consulting" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Synthetic te invita como lector.")).toBeInTheDocument();
    expect(screen.getByText(/sin dinero, y no podrás editar/)).toBeInTheDocument();
    expect(screen.getByText("La invitación caduca el 30 nov 2026.")).toBeInTheDocument();
  });

  it("accepts the invitation by its id, in the page's locale", async () => {
    const user = userEvent.setup();
    const accept = vi.fn<AcceptAction>(accepted);
    renderWithIntl(<InvitationView invitationId={id} invitation={invitation} accept={accept} />, {
      locale: "en",
    });

    await user.click(screen.getByRole("button", { name: "Accept the invitation" }));

    const sent = accept.mock.calls[0]?.[1];
    expect(sent?.get("invitationId")).toBe(id);
    expect(sent?.get("locale")).toBe("en");
  });

  it("says why accepting failed", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <InvitationView
        invitationId={id}
        invitation={invitation}
        accept={async () => ({ error: "used" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Aceptar la invitación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya se aceptó esta invitación.");
  });

  it.each([
    ["used", "Ya se aceptó esta invitación."],
    ["revoked", "Esta invitación se revocó."],
    ["expired", "Esta invitación caducó."],
    ["unverified", "no han verificado tu email"],
  ] as const)("offers no acceptance when it is %s, and says why", (refusal, text) => {
    renderWithIntl(
      <InvitationView
        invitationId={id}
        invitation={{ ...invitation, refusal }}
        accept={accepted}
      />,
    );

    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceptar la invitación" })).not.toBeInTheDocument();
  });

  it("leads a member to the organization instead", () => {
    renderWithIntl(
      <InvitationView
        invitationId={id}
        invitation={{ ...invitation, refusal: "already-member" }}
        accept={accepted}
      />,
    );

    expect(screen.getByText("Ya eres miembro de esta organización.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a tu organización" })).toHaveAttribute(
      "href",
      "/organization",
    );
  });
});
