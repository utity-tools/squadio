import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu";

// Menus and popovers (ADR 0014): radius 10 on --popover with the largest shadow, rows 32 px with
// radius 6; what destroys sits last in the bad status's text colour.

function Menu() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>⋯</DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Acciones">
        <DropdownMenuLabel>Asignación</DropdownMenuLabel>
        <DropdownMenuItem>Editar…</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Quitar del equipo</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("floats with radius 10 and the largest shadow", () => {
    render(<Menu />);

    expect(screen.getByRole("menu")).toHaveClass("rounded-lg", "bg-popover", "shadow-lg", "p-1");
  });

  it("has 32 px rows with radius 6", () => {
    render(<Menu />);

    expect(screen.getByRole("menuitem", { name: "Editar…" })).toHaveClass("min-h-8", "rounded-sm");
  });

  it("writes what destroys in the bad status's text colour", () => {
    render(<Menu />);

    expect(screen.getByRole("menuitem", { name: "Quitar del equipo" })).toHaveClass(
      "data-[variant=destructive]:text-status-bad-text",
    );
  });

  it("labels groups in small capitals", () => {
    render(<Menu />);

    expect(screen.getByText("Asignación")).toHaveClass("text-[11px]", "uppercase");
  });
});
