import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { SignInToReturnLink } from "./sign-in-to-return";

const id = "0b5e0c1e-0000-4000-8000-000000000300";

vi.mock("next/navigation", () => ({ usePathname: () => `/en/invitations/${id}` }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
  }: {
    href: { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) => <a href={`${href.pathname}?${new URLSearchParams(href.query)}`}>{children}</a>,
}));

describe("SignInToReturnLink", () => {
  it("signs in and comes back to the page it is on", () => {
    renderWithIntl(<SignInToReturnLink />);

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent(`/en/invitations/${id}`)}`,
    );
  });
});
