import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import NotFound from "./not-found";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("NotFound", () => {
  it("says the page was not found, without saying whether anything exists there", () => {
    renderWithIntl(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeInTheDocument();
  });

  it("links back to the home page", () => {
    renderWithIntl(<NotFound />, { locale: "en" });

    expect(screen.getByRole("link", { name: "Back to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
