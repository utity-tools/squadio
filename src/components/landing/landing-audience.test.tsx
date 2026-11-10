import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingAudience } from "./landing-audience";

describe("LandingAudience", () => {
  it("says who it is for in a section of its own", () => {
    renderWithIntl(<LandingAudience />);

    expect(
      screen.getByRole("region", { name: "Una herramienta, tres miradas." }),
    ).toBeInTheDocument();
  });

  it("names the three audiences, project managers seeing no money", () => {
    renderWithIntl(<LandingAudience />, { locale: "en" });

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Partners and leadership", "Operations", "Project managers"]);
    expect(screen.getByText(/never the money\.$/)).toBeInTheDocument();
  });
});
