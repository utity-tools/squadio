import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

// A side panel (design board 29, "Menú"): a dialog against the window's end edge, over --scrim,
// that slides in and keeps the focus inside until it closes.

function Menu() {
  return (
    <Sheet>
      <SheetTrigger>Abrir el menú</SheetTrigger>
      <SheetContent closeLabel="Cerrar el menú" aria-describedby={undefined}>
        <SheetTitle>Menú</SheetTitle>
        <button type="button">Inicio</button>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("is a modal dialog at the end edge, on --popover, sliding in over --scrim", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir el menú" }));

    const panel = screen.getByRole("dialog", { name: "Menú" });
    expect(panel).toHaveClass("end-0", "inset-y-0", "bg-popover", "animate-sheet-in");
    expect(document.querySelector("[data-slot=sheet-overlay]")).toHaveClass(
      "bg-scrim",
      "animate-scrim-in",
    );
  });

  it("closes with Escape and gives the focus back to what opened it", async () => {
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "Abrir el menú" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the focus inside while open", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir el menú" }));

    for (let i = 0; i < 4; i++) {
      await userEvent.tab();
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("has a close button with the caller's name and the app's focus outline", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir el menú" }));

    const close = screen.getByRole("button", { name: "Cerrar el menú" });
    expect(close).toHaveClass("size-11");
    // Drawn at the top, so it comes first in the focus order too.
    expect(close).toHaveFocus();
    expect(close.className).not.toMatch(/outline-(none|hidden)/);
    await userEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
