import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { AccountStatusView } from "./account-status";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("./sign-out-button", () => ({ SignOutButton: () => <button>Cerrar sesión</button> }));

describe("AccountStatusView", () => {
  it("names the signed-in account and offers to sign out", () => {
    renderWithIntl(<AccountStatusView account={{ name: "Ada Synthetic" }} signUp={false} />);

    expect(screen.getByText("Ada Synthetic")).toBeInTheDocument();
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
});
