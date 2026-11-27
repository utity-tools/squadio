import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { ViewSwitch } from "./view-switch";

describe("ViewSwitch", () => {
  it("keeps each option's name and title when only its icon shows, from lg", () => {
    renderWithIntl(<ViewSwitch view="tree" onViewChange={() => {}} stacked />);

    const group = screen.getByRole("radiogroup", { name: "Vista" });
    // Over the tree the options stack beside the canvas's zoom buttons, from lg.
    expect(group).toHaveClass("lg:flex-col");
    for (const name of ["Árbol", "Tabla"]) {
      const option = screen.getByRole("radio", { name });
      expect(option).toHaveAttribute("title", name);
      expect(screen.getByText(name)).toHaveClass("lg:sr-only");
    }
  });

  it("lies flat unless asked to stack, as over the table", () => {
    renderWithIntl(<ViewSwitch view="table" onViewChange={() => {}} />);

    expect(screen.getByRole("radiogroup", { name: "Vista" })).not.toHaveClass("lg:flex-col");
    expect(screen.getByRole("radio", { name: "Tabla" })).toHaveAttribute("title", "Tabla");
  });

  it("moves between the options with either pair of arrows, as it lies or stands", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    renderWithIntl(<ViewSwitch view="tree" onViewChange={onViewChange} />);

    await user.tab();
    expect(screen.getByRole("radio", { name: "Árbol" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Tabla" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Árbol" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Tabla" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Árbol" })).toHaveFocus();
    expect(onViewChange).toHaveBeenCalledWith("table");
  });
});
