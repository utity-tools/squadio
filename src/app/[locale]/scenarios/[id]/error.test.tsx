import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import ScenarioError from "./error";

describe("ScenarioError", () => {
  it("says the scenario could not be opened, without the error's details", () => {
    renderWithIntl(<ScenarioError error={new Error("secret detail")} retry={() => {}} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No hemos podido abrir este escenario" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
  });

  it("tries again on request", async () => {
    const retry = vi.fn();
    renderWithIntl(<ScenarioError error={new Error("down")} retry={retry} />, { locale: "en" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
