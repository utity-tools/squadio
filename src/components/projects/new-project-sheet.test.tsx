import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { type NewProjectAction, NewProjectSheet } from "./new-project-sheet";

// Board 05's «Nuevo proyecto»: a side sheet with name, client, the pricing model as two radio
// cards and, for a fixed price, an optional price. The Server Action leads to the project's page;
// a failure keeps the sheet open with what was typed.

const succeeding = () => vi.fn<NewProjectAction>(async () => ({ error: null, errors: {} }));

async function open(action: NewProjectAction = succeeding(), locale: "es" | "en" = "es") {
  renderWithIntl(<NewProjectSheet action={action} trigger="new" />, { locale });
  await userEvent.click(
    screen.getByRole("button", { name: locale === "es" ? "Nuevo proyecto" : "New project" }),
  );
  return screen.getByRole("dialog", { name: locale === "es" ? "Nuevo proyecto" : "New project" });
}

describe("NewProjectSheet", () => {
  it("opens with a fixed price chosen and an optional price that leaves revenue pending", async () => {
    await open();

    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Precio cerrado" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Tiempo y materiales" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: /Precio/ })).toHaveAccessibleDescription(
      "Sin precio, ingresos y margen quedarán pendientes.",
    );
  });

  it("asks for no price in time and materials", async () => {
    await open();

    await userEvent.click(screen.getByRole("radio", { name: "Tiempo y materiales" }));

    expect(screen.queryByRole("textbox", { name: /Precio/ })).toBeNull();
  });

  it("sends the project with the page's locale", async () => {
    const action = succeeding();
    await open(action);

    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Client portal");
    await userEvent.type(screen.getByRole("textbox", { name: "Cliente" }), "Synthetic Bank");
    await userEvent.type(screen.getByRole("textbox", { name: /Precio/ }), "200.000,00");
    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = Object.fromEntries(action.mock.calls[0]![1].entries());
    expect(sent).toEqual({
      locale: "es",
      name: "Client portal",
      client: "Synthetic Bank",
      pricingModel: "fixed",
      price: "200.000,00",
    });
  });

  it("shows each field's error and keeps what was typed", async () => {
    const action = vi.fn<NewProjectAction>(async () => ({
      error: null,
      errors: { client: "blank", price: "invalid" },
    }));
    await open(action);

    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Client portal");
    await userEvent.type(screen.getByRole("textbox", { name: /Precio/ }), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    const client = await screen.findByRole("textbox", { name: "Cliente" });
    await waitFor(() => expect(client).toBeInvalid());
    expect(client).toHaveAccessibleDescription("Escribe al menos un carácter.");
    expect(screen.getByRole("textbox", { name: /Precio/ })).toHaveAccessibleDescription(
      /Escribe un importe en euros/,
    );
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Client portal");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says why the project was not created", async () => {
    const action = vi.fn<NewProjectAction>(async () => ({ error: "no-rate-access", errors: {} }));
    await open(action);

    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Crear proyectos necesita acceso a tarifas.",
    );
  });

  it("closes with Cancel and gives the focus back", async () => {
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toHaveFocus();
  });

  it("speaks English under /en", async () => {
    await open(succeeding(), "en");

    expect(screen.getByRole("radio", { name: "Time and materials" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create project" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    await open();

    await expectNoAxeViolations();
  });
});
