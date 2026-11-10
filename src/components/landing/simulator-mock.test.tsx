import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { SimulatorMock } from "./simulator-mock";

// Intl's narrow no-break spaces become plain ones, so the expectations read as typed.
const plain = (text: string | null) => text?.replace(/[  ]/g, " ");

describe("SimulatorMock", () => {
  it("is a picture whose name gives Plan A's net margin, as the summary costs it", () => {
    renderWithIntl(<SimulatorMock />);

    const [desktop, phone] = screen.getAllByRole("img");
    expect(plain(desktop?.getAttribute("aria-label") ?? null)).toBe(
      "Vista del simulador: el árbol del equipo y la cuenta de resultados, con un margen neto de 63.356 €, el 31,7 %, en objetivo.",
    );
    expect(plain(phone?.getAttribute("aria-label") ?? null)).toBe(
      "Vista del simulador en el móvil: margen neto de 63.356 €, el 31,7 %, en objetivo, y el equipo.",
    );
  });

  it("speaks the locale of the page", () => {
    renderWithIntl(<SimulatorMock />, { locale: "en" });

    expect(plain(screen.getAllByRole("img")[0]?.getAttribute("aria-label") ?? null)).toBe(
      "Simulator view: the team tree and the results, with a net margin of €63,356, 31.7%, on target.",
    );
  });

  it("draws the results ledger from the costing, line by line", () => {
    renderWithIntl(<SimulatorMock />);

    const desktop = screen.getAllByRole("img")[0];
    if (!desktop) throw new Error("No picture");
    const text = plain(desktop.textContent);
    for (const line of [
      "Coste de personal102.831 €",
      "Cloud5967 €",
      "Overhead 15 %15.425 €",
      "Buffer 10 %12.422 €",
      "Coste total136.644 €",
      "Ingresos200.000 €",
      "Margen neto63.356 €",
      "Tarifa efectiva84,04 €/h",
      "En objetivo · 25 %",
    ]) {
      expect(text).toContain(line);
    }
  });

  it("draws Plan A's team with its open role and a target to drop on", () => {
    renderWithIntl(<SimulatorMock />);

    const desktop = screen.getAllByRole("img")[0];
    if (!desktop) throw new Error("No picture");
    const view = within(desktop);
    expect(view.getByText("Senior Developer 1")).toBeInTheDocument();
    expect(view.getByText("Vacante")).toBeInTheDocument();
    expect(view.getByText("Soltar aquí")).toBeInTheDocument();
    expect(view.getByText("A cargo de Tech lead")).toBeInTheDocument();
    expect(view.getAllByText("Junior Developer 1")).toHaveLength(2);
  });

  it("hides the notes around the picture, which its name already covers", () => {
    renderWithIntl(<SimulatorMock />);

    for (const note of [
      "Arrastra desde el banquillo",
      "Se recalcula en cada cambio",
      "Coste por categoría, nunca por persona",
    ]) {
      expect(screen.getByText(note).closest("[aria-hidden]")).not.toBeNull();
    }
  });
});
