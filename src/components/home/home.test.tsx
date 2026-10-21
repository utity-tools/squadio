import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { Home } from "./home";

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
});
