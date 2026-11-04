import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

// The design system's tables (ADR 0014): 36 px rows, the header on --muted, numbers right-aligned
// in mono, a selected row on --selected and a total row in bold on --muted.

function Ledger() {
  return (
    <Table aria-label="Coste">
      <TableHeader>
        <TableRow>
          <TableHead>Categoría</TableHead>
          <TableHead numeric>Coste</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow selected aria-selected>
          <TableCell>Senior Developer</TableCell>
          <TableCell numeric>45,88 €</TableCell>
        </TableRow>
        <TableRow total>
          <TableCell>Total</TableCell>
          <TableCell numeric>91,76 €</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("Table", () => {
  it("draws a bordered table with radius 12", () => {
    render(<Ledger />);

    expect(screen.getByRole("table", { name: "Coste" })).toHaveClass(
      "border-separate",
      "border-spacing-0",
      "rounded-[12px]",
      "border",
    );
  });

  it("sets the header on --muted, 36 px high, in muted words", () => {
    render(<Ledger />);

    const head = screen.getByRole("columnheader", { name: "Categoría" });
    expect(head).toHaveClass("h-9", "bg-muted", "text-muted-foreground", "text-left");
    // A numeric column's header is right-aligned with its figures, in the text face.
    expect(screen.getByRole("columnheader", { name: "Coste" })).toHaveClass("text-right");
    expect(screen.getByRole("columnheader", { name: "Coste" })).not.toHaveClass("font-mono");
  });

  it("right-aligns numbers in mono", () => {
    render(<Ledger />);

    expect(screen.getByRole("cell", { name: "45,88 €" })).toHaveClass(
      "h-9",
      "text-right",
      "font-mono",
      "tabular-nums",
    );
    expect(screen.getByRole("cell", { name: "Senior Developer" })).not.toHaveClass("text-right");
  });

  it("marks the selected row and the total row", () => {
    render(<Ledger />);

    const [, selected, total] = screen.getAllByRole("row");
    expect(selected).toHaveAttribute("data-selected", "true");
    expect(selected).toHaveClass("[&>td]:bg-selected", "[&>td]:text-selected-foreground");
    expect(total).toHaveClass("[&>td]:bg-muted", "font-semibold");
  });
});
