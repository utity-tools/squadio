import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert, AlertTitle } from "./alert";

// Alerts stay in the smallest place that holds the problem (ADR 0014). The icon and the title's
// words say what kind it is, as well as the colour.

describe("Alert", () => {
  it("draws a warning on the warning's tint with a dashed border, its title in -text", () => {
    render(
      <Alert tone="warn" data-testid="alert">
        <AlertTitle>Correcciones pendientes</AlertTitle>
        Falta el coste de QA Engineer.
      </Alert>,
    );

    const alert = screen.getByTestId("alert");
    expect(alert).toHaveClass("tint-warn", "border-dashed", "border-status-warn", "rounded-[10px]");
    expect(screen.getByText("Correcciones pendientes")).toHaveClass("text-status-warn-text");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws a problem on the bad status's tint, its title in -text", () => {
    render(
      <Alert tone="bad" data-testid="alert">
        <AlertTitle>No se ha podido guardar</AlertTitle>
      </Alert>,
    );

    expect(screen.getByTestId("alert")).toHaveClass("tint-bad");
    expect(screen.getByTestId("alert")).not.toHaveClass("border-dashed");
    expect(screen.getByText("No se ha podido guardar")).toHaveClass("text-status-bad-text");
  });

  it("makes its title a heading when asked", () => {
    render(
      <Alert tone="warn">
        <AlertTitle asChild>
          <h2>Tope de presupuesto superado</h2>
        </AlertTitle>
      </Alert>,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("text-status-warn-text");
  });

  it("leaves announcing to the caller", () => {
    render(<Alert tone="bad">x</Alert>);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
