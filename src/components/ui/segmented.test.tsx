import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Segmented, SegmentedItem } from "./segmented";

// The segmented control (ADR 0014): one tab stop, the arrows choose, and the active option is
// neutral (--primary), never the brand.

function Views() {
  return (
    <Segmented aria-label="Vista" value="tree">
      <SegmentedItem value="tree">Árbol</SegmentedItem>
      <SegmentedItem value="table">Tabla</SegmentedItem>
    </Segmented>
  );
}

describe("Segmented", () => {
  it("is a radio group framed by the input's border", () => {
    render(<Views />);

    expect(screen.getByRole("radiogroup", { name: "Vista" })).toHaveClass(
      "rounded-md",
      "border-input",
      "p-0.5",
    );
  });

  it("fills the active option with the neutral --primary, never the brand", () => {
    render(<Views />);

    const active = screen.getByRole("radio", { name: "Árbol" });
    expect(active).toBeChecked();
    expect(active).toHaveClass(
      "h-7.5",
      "rounded-sm",
      "data-[state=checked]:bg-primary",
      "data-[state=checked]:text-primary-foreground",
    );
    expect(active.className).not.toMatch(/brand/);
  });

  it("keeps the app's 2 px focus outline", () => {
    render(<Views />);

    expect(screen.getByRole("radio", { name: "Árbol" }).className).not.toMatch(
      /outline-(none|hidden)/,
    );
  });

  it("is one tab stop, and the arrows move between options", async () => {
    render(<Views />);

    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Árbol" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");

    // Choosing on focus, however quick the key, is the caller's (see ViewSwitch).
    expect(screen.getByRole("radio", { name: "Tabla" })).toHaveFocus();
  });
});
