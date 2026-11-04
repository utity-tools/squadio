import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "./logo";

// The placeholder brand (ADR 0014, "Marca (provisional)"): three squares, two filled in --brand
// and the third outlined in --brand too, as every board draws it, and the word in Plus Jakarta
// Sans 800 at -0.04em. The logo is decoration: the link around it names it.

describe("Logo", () => {
  it("draws the three-square mark in the brand tokens, hidden from assistive technology", () => {
    const { container } = render(<Logo />);

    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    const squares = [...container.querySelectorAll("rect")];
    expect(squares).toHaveLength(3);
    expect(squares.map((square) => square.getAttribute("fill"))).toEqual([
      "var(--brand)",
      "var(--brand)",
      "none",
    ]);
    expect(squares[2]).toHaveAttribute("stroke", "var(--brand)");
  });

  it("sets the word in the heading face, weight 800, letter-spacing -0.04em", () => {
    const { getByText } = render(<Logo />);

    const word = getByText("squadio");
    expect(word).toHaveAttribute("aria-hidden", "true");
    expect(word).toHaveClass("font-heading", "font-extrabold", "tracking-[-0.04em]");
  });

  it("can show the mark alone, for the scenario editor's narrow corner", () => {
    const { container, queryByText } = render(<Logo wordmark={false} />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(queryByText("squadio")).not.toBeInTheDocument();
  });

  it("can keep the word for screens from sm, as the phone's top bar does", () => {
    const { getByText } = render(<Logo wordmark="from-sm" />);

    expect(getByText("squadio")).toHaveClass("max-sm:hidden");
  });
});
