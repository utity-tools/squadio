import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { ShellPlacement } from "@/components/shell/placement";

import { AccountStatusView } from "./account-status";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./sign-out-button", () => ({ SignOutButton: () => <button>Cerrar sesión</button> }));
vi.mock("./use-sign-out", () => ({
  useSignOut: () => ({ signOut: vi.fn(), pending: false, failed: false }),
}));

describe("AccountStatusView", () => {
  it("names the signed-in account, links to its organization and offers to sign out", () => {
    renderWithIntl(<AccountStatusView account={{ name: "Ada Synthetic" }} signUp={false} />);

    expect(screen.getByText("Ada Synthetic")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tu organización" })).toHaveAttribute(
      "href",
      "/organization",
    );
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
  });

  it("links to the sign-in page while sign-up is open", () => {
    renderWithIntl(<AccountStatusView account={null} signUp />);

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/sign-in");
  });

  it("shows nothing to sign in with while sign-up is off (ADR 0012)", () => {
    const { container } = renderWithIntl(<AccountStatusView account={null} signUp={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe("in the phone and tablet menu", () => {
    it("offers «Salir» as a 44 px item", () => {
      renderWithIntl(
        <ShellPlacement value="menu">
          <AccountStatusView account={{ name: "Ada Synthetic" }} signUp={false} />
        </ShellPlacement>,
      );

      expect(screen.getByRole("button", { name: "Salir" })).toHaveClass("min-h-11");
      expect(screen.queryByRole("link", { name: "Tu organización" })).not.toBeInTheDocument();
    });

    it("offers «Entrar» as a 44 px item while sign-up is open", () => {
      renderWithIntl(
        <ShellPlacement value="menu">
          <AccountStatusView account={null} signUp />
        </ShellPlacement>,
      );

      const signIn = screen.getByRole("link", { name: "Entrar" });
      expect(signIn).toHaveAttribute("href", "/sign-in");
      expect(signIn).toHaveClass("min-h-11");
    });
  });
});
