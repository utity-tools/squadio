import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

// The design system's buttons (ADR 0014): 36 px, radius 8 (rounded-md), one primary per screen in the brand's
// solid fill, a 120 ms press that stays still for reduced motion.

describe("Button", () => {
  it("fills the primary button with the brand's solid colour, darker on hover", () => {
    render(<Button>Elegir escenario</Button>);

    const button = screen.getByRole("button", { name: "Elegir escenario" });
    expect(button).toHaveClass(
      "bg-brand-solid",
      "text-brand-solid-foreground",
      "hover:bg-brand-solid-hover",
    );
    expect(button).not.toHaveClass("bg-primary");
  });

  it("keeps the brand fill when a waiting primary is hovered", () => {
    render(<Button aria-disabled>Elegir escenario</Button>);

    expect(screen.getByRole("button")).toHaveClass("aria-disabled:hover:bg-brand-solid");
  });

  it("draws outline buttons on the page with the input's border", () => {
    render(<Button variant="outline">Cancelar</Button>);

    expect(screen.getByRole("button")).toHaveClass(
      "border-input",
      "bg-background",
      "hover:bg-muted",
    );
  });

  it.each([
    ["default", "h-9"],
    ["sm", "h-7.5"],
    ["icon", "size-9"],
    ["icon-sm", "size-7"],
  ] as const)("sizes %s buttons as the spec does", (size, height) => {
    render(<Button size={size}>x</Button>);

    expect(screen.getByRole("button")).toHaveClass(height, "rounded-md");
  });

  it("presses in 120 ms with the snappy curve, and not at all for reduced motion", () => {
    render(<Button>x</Button>);

    expect(screen.getByRole("button")).toHaveClass(
      "duration-(--duration-fast)",
      "ease-snappy",
      "active:scale-[0.98]",
      "motion-reduce:transition-none",
      "motion-reduce:active:scale-100",
    );
  });
});
