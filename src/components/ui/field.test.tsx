import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { Field, controlClassName } from "./field";

// The design system's field (ADR 0014): label above, a 36 px control, help below; the error
// replaces the help. Numbers sit right-aligned in Geist Mono.

describe("Field", () => {
  it("names its control with the label above it and describes it with the help below", () => {
    renderWithIntl(
      <Field label="Horas por semana" help="Por defecto, 40 h.">
        {(control) => <input {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("Horas por semana");
    expect(input).toHaveAccessibleDescription("Por defecto, 40 h.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("replaces the help with the error and marks the control invalid", () => {
    renderWithIntl(
      <Field label="Fin" help="Fecha de fin." error="El fin es anterior al inicio.">
        {(control) => <input {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText("Fin");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("El fin es anterior al inicio.");
    expect(screen.queryByText("Fecha de fin.")).not.toBeInTheDocument();
    expect(screen.getByText("El fin es anterior al inicio.")).toHaveClass("text-status-bad-text");
  });

  it("says an optional field is optional, in the reader's language", () => {
    const { unmount } = renderWithIntl(
      <Field label="Descripción" optional>
        {(control) => <input {...control} />}
      </Field>,
    );
    expect(screen.getByText("Opcional")).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <Field label="Description" optional>
        {(control) => <input {...control} />}
      </Field>,
      { locale: "en" },
    );
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAccessibleName("Description Optional");
  });

  it("has no description when there is neither help nor error", () => {
    renderWithIntl(<Field label="Rol">{(control) => <input {...control} />}</Field>);

    expect(screen.getByLabelText("Rol")).not.toHaveAttribute("aria-describedby");
  });
});

describe("controlClassName", () => {
  it("is 36 px with radius 8 on the input's border", () => {
    expect(controlClassName()).toMatch(/\bh-9\b/);
    expect(controlClassName()).toMatch(/\brounded-md\b/);
    expect(controlClassName()).toMatch(/\bborder-input\b/);
  });

  it("rings the focus and the invalid state, and dashes what is read-only", () => {
    const classes = controlClassName();
    expect(classes).toMatch(/focus-visible:border-ring/);
    expect(classes).toMatch(/aria-invalid:border-status-bad/);
    // Only text that cannot be typed in: CSS's :read-only also matches every <select>.
    expect(classes).toContain("[&:is(input,textarea):read-only]:border-dashed");
    expect(classes).toContain("[&:is(input,textarea):read-only]:bg-muted");
    expect(classes).not.toMatch(/(^|\s)read-only:/);
  });

  it("keeps the app's 2 px focus outline", () => {
    expect(controlClassName()).not.toMatch(/outline-(none|hidden)/);
  });

  it("right-aligns numbers in mono", () => {
    expect(controlClassName({ numeric: true })).toMatch(/text-right font-mono tabular-nums/);
    expect(controlClassName()).not.toMatch(/text-right/);
  });
});
