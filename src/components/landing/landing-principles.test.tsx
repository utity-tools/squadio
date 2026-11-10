import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingPrinciples } from "./landing-principles";

describe("LandingPrinciples", () => {
  it("states what Squadio doesn't do, in a section the header leads to", () => {
    renderWithIntl(<LandingPrinciples />);

    const section = screen.getByRole("region", { name: "Lo que Squadio no hace." });
    expect(section).toHaveAttribute("id", "principios");
  });

  it("says no salary is stored, of anyone: costs are per category", () => {
    renderWithIntl(<LandingPrinciples />);

    const principles = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(principles).toHaveLength(4);
    expect(principles[0]).toHaveTextContent(
      "No guarda salarios de nadieLos costes van por categoría, nunca por persona.",
    );
  });

  it("lists the four principles in English", () => {
    renderWithIntl(<LandingPrinciples />, { locale: "en" });

    expect(
      within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .map((principle) => principle.firstChild?.textContent),
    ).toEqual([
      "Nobody's salary stored",
      "No judging people",
      "No money for the wrong eyes",
      "No promises about availability",
    ]);
  });
});
