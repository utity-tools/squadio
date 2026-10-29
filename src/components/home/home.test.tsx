import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { Home } from "./home";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("Home", () => {
  it("shows the product name as the main heading", () => {
    renderWithIntl(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Squadio" })).toBeInTheDocument();
  });

  it("speaks the locale of the page", () => {
    renderWithIntl(<Home />, { locale: "en" });

    expect(
      screen.getByText("Build a project team and see cost and margin before you commit."),
    ).toBeInTheDocument();
  });

  it("speaks Spanish by default", () => {
    renderWithIntl(<Home />);

    expect(screen.getByText(/Arma el equipo de un proyecto/)).toBeInTheDocument();
  });

  it("leads to the demo's guide scenario", () => {
    renderWithIntl(<Home />, { locale: "en" });

    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute(
      "href",
      "/scenarios/6d656d6f-0000-4000-8000-000000000200",
    );
  });

  it("says the demo's data is made up", () => {
    renderWithIntl(<Home />);

    expect(screen.getByText(/nombres y cifras son ficticios/)).toBeInTheDocument();
  });
});
