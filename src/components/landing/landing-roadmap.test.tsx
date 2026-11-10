import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingRoadmap } from "./landing-roadmap";

describe("LandingRoadmap", () => {
  it("says where it stands, in a section the header leads to", () => {
    renderWithIntl(<LandingRoadmap />);

    const section = screen.getByRole("region", { name: "En qué punto está." });
    expect(section).toHaveAttribute("id", "hoja");
  });

  it("lists the versions in order, each with its status in words (docs/plan.md)", () => {
    renderWithIntl(<LandingRoadmap />);

    const versions = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(versions.map((version) => version.firstChild?.textContent)).toEqual([
      "Disponible",
      "En curso",
      "Después",
      "Después",
    ]);
    expect(versions[0]).toHaveTextContent(/^DisponibleSimularArrastra personas y vacantes/);
    expect(versions[1]).toHaveTextContent(/^En cursoPreparar/);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Simular", "Preparar", "Comparar", "Compartir"]);
  });

  it("marks each status with a dot as well as its word", () => {
    renderWithIntl(<LandingRoadmap />, { locale: "en" });

    for (const status of ["Available", "In progress"]) {
      const chip = screen.getByText(status);
      expect(chip.querySelector("[aria-hidden]")).not.toBeNull();
    }
    for (const chip of screen.getAllByText("Later")) {
      expect(chip.querySelector("[aria-hidden]")).not.toBeNull();
    }
  });
});
