import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ProjectsEmpty } from "./projects-empty";

// Board 05's empty state, without «Crear proyecto» until projects can be created (v0.3).

describe("ProjectsEmpty", () => {
  it("says there are no projects yet and what a project is", () => {
    renderWithIntl(<ProjectsEmpty />);

    expect(screen.getByRole("region", { name: "Aún no tienes proyectos" })).toHaveTextContent(
      /Un proyecto es el encargo de un cliente/,
    );
  });

  it("offers no action the app cannot take yet", () => {
    renderWithIntl(<ProjectsEmpty />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("speaks English under /en", () => {
    renderWithIntl(<ProjectsEmpty />, { locale: "en" });

    expect(screen.getByRole("heading", { name: "You have no projects yet" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<ProjectsEmpty />);

    await expectNoAxeViolations();
  });
});
