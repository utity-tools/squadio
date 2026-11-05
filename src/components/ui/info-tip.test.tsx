import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { InfoTip } from "./info-tip";

// The design system's inline help (ADR 0014, board "Info"): an "i" before a figure's label that
// says what it means and how it is worked out. It opens while the pointer or the keyboard's focus
// is on it and closes when they leave, so it never stays open.

const tip = (
  <InfoTip label="Qué es: Overhead" title="Overhead" formula="overhead % × coste de personal">
    Los costes de la empresa que no son de ningún proyecto.
  </InfoTip>
);

const button = () => screen.getByRole("button", { name: "Qué es: Overhead" });

describe("InfoTip", () => {
  it("is a button named for its term, closed at first", () => {
    render(tip);

    expect(button()).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on hover with the term, its meaning and its formula, and closes on leaving", async () => {
    const user = userEvent.setup();
    render(tip);

    await user.hover(button());
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Los costes de la empresa que no son de ningún proyecto.");
    expect(tooltip).toHaveTextContent("overhead % × coste de personal");
    await expectNoAxeViolations();

    await user.unhover(button());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens with the keyboard's focus and closes with Escape", async () => {
    const user = userEvent.setup();
    render(tip);

    await user.tab();
    expect(button()).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Overhead");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button()).toHaveFocus();
  });

  it("does not stay open after a click", async () => {
    const user = userEvent.setup();
    render(tip);

    await user.click(button());
    await user.unhover(button());
    await user.tab();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
