import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Chip } from "./chip";

// The design system's chips (ADR 0014): radius 6, never pills. A status chip says its word and
// carries a dot, so colour is never the only signal.

describe("Chip", () => {
  it.each([
    ["ok", "tint-ok", "text-status-ok-text", "bg-status-ok"],
    ["warn", "tint-warn", "text-status-warn-text", "bg-status-warn"],
    ["bad", "tint-bad", "text-status-bad-text", "bg-status-bad"],
  ] as const)("draws a %s status as its tint, its -text and a dot", (tone, tint, text, dot) => {
    render(<Chip tone={tone}>En objetivo</Chip>);

    const chip = screen.getByText("En objetivo");
    expect(chip).toHaveClass(tint, text, "rounded-sm");
    expect(chip).not.toHaveClass("rounded-full");
    const mark = chip.querySelector("[data-slot=chip-dot]");
    expect(mark).toHaveClass(dot);
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("marks what is pending with the warning's dashed border, and no dot", () => {
    render(<Chip tone="pending">Pendiente</Chip>);

    const chip = screen.getByText("Pendiente");
    expect(chip).toHaveClass("tint-warn", "border-dashed", "border-status-warn");
    expect(chip.querySelector("[data-slot=chip-dot]")).toBeNull();
  });

  it("fills the chosen chip with the brand, never a status", () => {
    render(<Chip tone="chosen">Elegido</Chip>);

    expect(screen.getByText("Elegido")).toHaveClass(
      "bg-brand-solid",
      "text-brand-solid-foreground",
    );
  });

  it.each([
    ["na", ["bg-muted", "text-muted-foreground"]],
    ["muted", ["bg-muted", "text-muted-foreground"]],
    ["error", ["tint-bad", "text-status-bad-text", "border-status-bad"]],
    ["demo", ["tint-brand", "text-brand-text"]],
    ["open", ["border-dashed", "border-muted-foreground", "text-muted-foreground"]],
  ] as const)("draws %s chips as the spec does", (tone, classes) => {
    render(<Chip tone={tone}>x</Chip>);

    expect(screen.getByText("x")).toHaveClass(...classes);
  });

  it("is muted unless told otherwise, and passes other props on", () => {
    render(
      <Chip data-testid="chip" className="ms-2">
        x
      </Chip>,
    );

    expect(screen.getByTestId("chip")).toHaveClass("bg-muted", "ms-2");
    expect(screen.getByTestId("chip")).toHaveAttribute("data-tone", "muted");
  });
});
