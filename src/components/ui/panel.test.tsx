import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Kpi, Panel, PanelTitle } from "./panel";

// Structure is drawn with borders and the faintest shadow (ADR 0014): radius 14, --card.

describe("Panel", () => {
  it("is a bordered card with the faintest shadow and its title", () => {
    render(
      <Panel aria-labelledby="t">
        <PanelTitle id="t">Coste por categoría</PanelTitle>
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "Coste por categoría" });
    expect(panel).toHaveClass("rounded-xl", "border", "bg-card", "shadow-xs");
    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("text-[15px]");
  });
});

describe("Kpi", () => {
  it("names its figure and sets it in mono", () => {
    render(<Kpi label="Margen" value="18,4 %" />);

    const card = screen.getByText("Margen").closest("[data-slot=kpi]");
    expect(card).toHaveClass("rounded-xl", "border", "bg-card", "shadow-xs");
    expect(screen.getByText("18,4 %")).toHaveClass("font-mono", "tabular-nums", "text-[28px]");
  });

  it("marks a pending figure with the warning's dashed tint and says it in words", () => {
    render(<Kpi label="Ingresos" value="Pendiente" pending />);

    const card = screen.getByText("Ingresos").closest("[data-slot=kpi]");
    expect(card).toHaveClass("tint-warn", "border-dashed", "border-status-warn");
    expect(screen.getByText("Pendiente")).toHaveClass("text-status-warn-text", "font-sans");
    expect(screen.getByText("Pendiente")).not.toHaveClass("font-mono");
  });
});
