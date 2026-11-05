import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClockIcon } from "lucide-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

// The design's interrupting windows (Errors board, section 4): 440 px, an icon on a tint beside
// the title and the text, and a way out that only its buttons give.

function Open({ tone, initial = true }: { tone?: "warn" | "muted"; initial?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <>
      <p>Página</p>
      <button type="button" onClick={() => setOpen(true)}>
        Editar
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader icon={<ClockIcon />} tone={tone}>
            <AlertDialogTitle>Hoy no se pueden guardar más copias</AlertDialogTitle>
            <AlertDialogDescription>Vuelve a intentarlo mañana.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Seguir sin guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

describe("AlertDialog", () => {
  it("interrupts as an alertdialog named by its title and described by its text", () => {
    render(<Open />);

    const dialog = screen.getByRole("alertdialog", { name: "Hoy no se pueden guardar más copias" });
    expect(dialog).toHaveAccessibleDescription("Vuelve a intentarlo mañana.");
  });

  it("is a 440 px window on --popover with radius 14 and the largest shadow", () => {
    render(<Open />);

    expect(screen.getByRole("alertdialog")).toHaveClass(
      "sm:max-w-[440px]",
      "rounded-xl",
      "bg-popover",
      "shadow-lg",
      "animate-dialog-in",
    );
    expect(document.querySelector("[data-slot=alert-dialog-overlay]")).toHaveClass("bg-scrim");
  });

  it("stays open when the page behind it is clicked", async () => {
    const user = userEvent.setup();
    render(<Open />);

    await user.click(document.querySelector("[data-slot=alert-dialog-overlay]") as Element);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("starts on its action, which closes it", async () => {
    const user = userEvent.setup();
    render(<Open />);

    const action = screen.getByRole("button", { name: "Seguir sin guardar" });
    expect(action).toHaveFocus();
    await user.click(action);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("gives the focus back to where it was when it interrupted", async () => {
    const user = userEvent.setup();
    render(<Open initial={false} />);
    const before = screen.getByRole("button", { name: "Editar" });

    await user.click(before);
    expect(screen.getByRole("button", { name: "Seguir sin guardar" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(before).toHaveFocus();
  });

  it.each([
    ["warn", "tint-warn", "text-status-warn-text"],
    ["muted", "bg-muted", "text-muted-foreground"],
  ] as const)("draws a %s icon on its tint, hidden from screen readers", (tone, fill, color) => {
    render(<Open tone={tone} />);

    const icon = document.querySelector("[data-slot=alert-dialog-icon]");
    expect(icon).toHaveClass(fill, color);
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("has no detectable accessibility violations", async () => {
    render(<Open />);

    await expectNoAxeViolations();
  });
});
