import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingProblem } from "./landing-problem";

describe("LandingProblem", () => {
  it("names the problem in a section of its own", () => {
    renderWithIntl(<LandingProblem />);

    expect(
      screen.getByRole("region", {
        name: "El margen se decide al montar el equipo. Y se descubre al cerrar el mes.",
      }),
    ).toBeInTheDocument();
  });

  it("lists the three pains, each with its title and what it means", () => {
    renderWithIntl(<LandingProblem />, { locale: "en" });

    const pains = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(pains.map((pain) => pain.textContent)).toEqual([
      "01Teams staffed on gut feelingPeople are picked without seeing what that mix really costs.",
      "02Versions nobody trustsThree copies of the same sheet and no way to tell which one is right.",
      "03Salaries in plain sightTo run the numbers, someone ends up opening the sheet with the salaries.",
    ]);
  });

  it("hides the spreadsheet names, which only illustrate the lead", () => {
    renderWithIntl(<LandingProblem />);

    expect(screen.getByText("propuesta_v4_FINAL (2).xlsx").closest("[aria-hidden]")).not.toBeNull();
  });
});
