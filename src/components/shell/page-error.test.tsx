import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { PageError } from "./page-error";

// What Inicio, the projects list and a project page show when they cannot be read (the database
// is down, a stored row is invalid): never Next.js's own English page, and never the details.

describe("PageError", () => {
  it("says the page could not be opened, without the error's details", () => {
    renderWithIntl(<PageError error={new Error("secret detail")} retry={() => {}} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No hemos podido abrir esta página" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent(
      "Algo ha fallado al leerla. Prueba otra vez dentro de un momento.",
    );
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
  });

  it("tries again on request", async () => {
    const retry = vi.fn();
    renderWithIntl(<PageError error={new Error("down")} retry={retry} />, { locale: "en" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<PageError error={new Error("down")} retry={() => {}} />);

    await expectNoAxeViolations();
  });
});
