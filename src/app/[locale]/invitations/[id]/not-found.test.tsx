import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import InvitationNotFound from "./not-found";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/account/sign-in-to-return-gate", () => ({
  SignInToReturn: () => <button type="button">Entrar</button>,
}));

// ADR 0015, amendment of 2026-11-23: an invitation's page, for anyone but the invited account, is
// the page not found, the same for every id; signed out, it offers to sign in and come back.

describe("InvitationNotFound", () => {
  it("is the page not found, naming nothing", () => {
    renderWithIntl(<InvitationNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Error 404");
  });

  it("offers to sign in and come back, as the gate decides", () => {
    renderWithIntl(<InvitationNotFound />);

    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
