import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { InfoTip } from "./info-tip";

// The design system's inline help (ADR 0014, board "Info"): an "i" next to a figure that says what
// it means and how it is worked out. It opens on a click, a tap or the keyboard, never on hover
// alone, so touch screens reach it too.

const tip = (
  <InfoTip label="Qué es: Overhead" title="Overhead" formula="overhead % × coste de personal">
    Los costes de la empresa que no son de ningún proyecto.
  </InfoTip>
);

describe("InfoTip", () => {
  it("is a button named for its term, closed at first", () => {
    render(tip);

    const button = screen.getByRole("button", { name: "Qué es: Overhead" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Los costes de la empresa que no son de ningún proyecto."),
    ).toBeNull();
  });

  it("opens on a click with the term, its meaning and its formula", async () => {
    render(tip);

    await userEvent.click(screen.getByRole("button", { name: "Qué es: Overhead" }));

    const dialog = screen.getByRole("dialog", { name: "Overhead" });
    expect(dialog).toHaveTextContent("Los costes de la empresa que no son de ningún proyecto.");
    expect(dialog).toHaveTextContent("overhead % × coste de personal");
    await expectNoAxeViolations();
  });

  it("opens with the keyboard and closes with Escape, giving the focus back", async () => {
    render(tip);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Overhead" })).toBeVisible();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Qué es: Overhead" })).toHaveFocus();
  });

  it("leaves the formula out when there is none", async () => {
    render(
      <InfoTip label="Qué es: Equipo" title="Equipo">
        Personas y vacantes.
      </InfoTip>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Qué es: Equipo" }));

    expect(screen.getByRole("dialog", { name: "Equipo" })).toHaveTextContent(
      /^EquipoPersonas y vacantes\.$/,
    );
  });
});
