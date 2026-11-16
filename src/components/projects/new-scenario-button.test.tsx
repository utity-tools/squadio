import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { type NewScenarioAction, NewScenarioButton } from "./new-scenario-button";

// Board 06's «Crear escenario»: an empty scenario the editor opens. Its team is built from the
// organization's categories, so it waits for the first one.

const projectId = "0b5e0c1e-0000-4000-8000-000000000004";

describe("NewScenarioButton", () => {
  it("creates a scenario of the project in the page's locale", async () => {
    const action = vi.fn<NewScenarioAction>(async () => ({ error: null }));
    renderWithIntl(<NewScenarioButton action={action} projectId={projectId} hasCategories />);

    await userEvent.click(screen.getByRole("button", { name: "Crear escenario" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(Object.fromEntries(action.mock.calls[0]![1].entries())).toEqual({
      projectId,
      locale: "es",
    });
  });

  it("waits for the organization's first category, and says so", async () => {
    const action = vi.fn<NewScenarioAction>();
    renderWithIntl(
      <NewScenarioButton action={action} projectId={projectId} hasCategories={false} />,
    );
    const button = screen.getByRole("button", { name: "Crear escenario" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Crea una categoría para montar el primer equipo.");

    await userEvent.click(button);

    expect(action).not.toHaveBeenCalled();
  });

  it("says why the scenario was not created", async () => {
    const action = vi.fn<NewScenarioAction>(async () => ({ error: "failed" as const }));
    renderWithIntl(<NewScenarioButton action={action} projectId={projectId} hasCategories />);

    await userEvent.click(screen.getByRole("button", { name: "Crear escenario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido crear el escenario.",
    );
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(
      <NewScenarioButton action={vi.fn()} projectId={projectId} hasCategories={false} />,
    );
    await expectNoAxeViolations();
  });
});
