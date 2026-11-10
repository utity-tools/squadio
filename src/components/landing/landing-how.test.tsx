import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingHow } from "./landing-how";

const plain = (text: string | null) => text?.replace(/[  ]/g, " ") ?? "";
const TITLE = "Prueba equipos antes de comprometerlos.";

describe("LandingHow", () => {
  it("is the section the header's «Cómo funciona» leads to", () => {
    renderWithIntl(<LandingHow />);

    expect(screen.getByRole("region", { name: TITLE })).toHaveAttribute("id", "como");
  });

  it("walks through four steps, the last one still to come", () => {
    renderWithIntl(<LandingHow />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Monta el equipo",
      "Mira el resultado al momento",
      "Sabe qué falta",
      "Compara escenarios",
    ]);
    expect(screen.getByText("04 · Próximamente")).toBeInTheDocument();
  });

  it("draws each step from Plan A's real costing, hidden from assistive technology", () => {
    renderWithIntl(<LandingHow />);

    const visuals = document.querySelectorAll("[data-slot='step-visual']");
    expect(visuals).toHaveLength(4);
    for (const visual of visuals) expect(visual).toHaveAttribute("aria-hidden", "true");
    const [, result, missing, compare] = [...visuals].map((visual) => plain(visual.textContent));
    expect(result).toContain("63.356 €");
    expect(result).toMatch(
      /Senior Developer.*Frontend Developer.*Project Manager.*DevOps Engineer/,
    );
    expect(missing).toContain("Falta el coste de DevOps Engineer");
    expect(missing).toContain("Ingresos200.000 €");
    expect(missing).toContain("Margen netoPendiente");
    expect(compare).toContain("Plan A31,7 %");
  });

  it("speaks the locale of the page", () => {
    renderWithIntl(<LandingHow />, { locale: "en" });

    expect(
      within(screen.getByRole("region", { name: "Try teams before you commit them." })).getByText(
        "04 · Coming soon",
      ),
    ).toBeInTheDocument();
  });
});
