import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./dialog";

// The design system's dialogs (ADR 0014): 440, 560 or 720 px over --scrim, radius 14, the
// largest shadow, a 180 ms entrance that stays still for reduced motion.

function Open({ size }: { size?: "sm" | "md" | "lg" }) {
  return (
    <Dialog open>
      <DialogContent size={size} closeLabel="Cerrar">
        <DialogTitle>Editar «Tech lead»</DialogTitle>
        <DialogDescription>Senior Developer 1 · Plan A</DialogDescription>
        <DialogFooter data-testid="footer" />
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it.each([
    ["sm", "sm:max-w-[440px]"],
    ["md", "sm:max-w-[560px]"],
    ["lg", "sm:max-w-[720px]"],
    [undefined, "sm:max-w-[560px]"],
  ] as const)("is %s wide as the spec says", (size, width) => {
    render(<Open size={size} />);

    expect(screen.getByRole("dialog")).toHaveClass(width);
  });

  it("floats on --popover with radius 14 and the largest shadow, and enters gently", () => {
    render(<Open />);

    expect(screen.getByRole("dialog")).toHaveClass(
      "rounded-xl",
      "bg-popover",
      "shadow-lg",
      "animate-dialog-in",
      "max-h-[calc(100%-3rem)]",
    );
  });

  it("veils the page with --scrim", () => {
    render(<Open />);

    expect(document.querySelector("[data-slot=dialog-overlay]")).toHaveClass(
      "bg-scrim",
      "animate-scrim-in",
    );
  });

  it("keeps the app's 2 px focus outline on its close button", () => {
    render(<Open />);

    expect(screen.getByRole("button", { name: "Cerrar" }).className).not.toMatch(
      /outline-(none|hidden)/,
    );
  });

  it("separates its footer with a border", () => {
    render(<Open />);

    expect(screen.getByTestId("footer")).toHaveClass("border-t", "sm:justify-end");
  });
});
