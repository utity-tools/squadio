import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingBuiltFor } from "./landing-built-for";

describe("LandingBuiltFor", () => {
  it("says what it does for consultancies in a section of its own", () => {
    renderWithIntl(<LandingBuiltFor />);

    expect(
      screen.getByRole("region", {
        name: "Pensado para cómo se prepara de verdad una propuesta.",
      }),
    ).toBeInTheDocument();
  });

  it("names the four features, each as a heading with what it means", () => {
    renderWithIntl(<LandingBuiltFor />, { locale: "en" });

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Numbers without exposing salaries",
      "Fixed price and T&M",
      "Overhead built in",
      "Dates per assignment",
    ]);
    expect(
      screen.getByText(/People without rate access never receive a single euro/),
    ).toBeInTheDocument();
  });

  it("hides the features' icons, which only decorate", () => {
    const { container } = renderWithIntl(<LandingBuiltFor />);

    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(4);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
