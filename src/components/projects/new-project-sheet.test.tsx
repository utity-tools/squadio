import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import type { NewProject } from "@/lib/projects/new-project";
import type { PeriodScenario } from "@/lib/projects/period-change";

import { type NewProjectAction, NewProjectSheet } from "./new-project-sheet";

// Board 05's «Nuevo proyecto»: a side sheet with name, client, the pricing model as two radio
// cards and, for a fixed price, an optional price. The Server Action leads to the project's page;
// a failure keeps the sheet open with what was typed.

const succeeding = () =>
  vi.fn<NewProjectAction>(async () => ({ saved: false, error: null, errors: {} }));

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
      plannedStart: "",
      plannedEnd: "",
      description: "",
    });
  });

  it("sends the planned period and the description, both optional", async () => {
    const action = succeeding();
    await open(action);

    expect(screen.getByRole("group", { name: /Periodo previsto/ })).toHaveAccessibleDescription(
      /Las asignaciones nuevas empiezan con estas fechas/,
    );
    await userEvent.type(screen.getByLabelText("Inicio"), "2027-04-01");
    await userEvent.type(screen.getByLabelText("Fin"), "2027-09-30");
    await userEvent.type(
      screen.getByRole("textbox", { name: /Descripción/ }),
      "A portal for the bank's clients.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(Object.fromEntries(action.mock.calls[0]![1].entries())).toMatchObject({
      plannedStart: "2027-04-01",
      plannedEnd: "2027-09-30",
      description: "A portal for the bank's clients.",
    });
  });

  it("says what is wrong with the planned period and the description", async () => {
    const action = vi.fn<NewProjectAction>(async () => ({
      saved: false,
      error: null,
      errors: {
        plannedStart: "outside-calendar",
        plannedEnd: "ends-before-start",
        description: "too-long",
      },
    }));
    await open(action);

    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(screen.getByLabelText("Inicio")).toBeInvalid());
    expect(screen.getByLabelText("Inicio")).toHaveAccessibleDescription(
      "Elige una fecha entre 2026 y 2028.",
    );
    expect(screen.getByLabelText("Fin")).toHaveAccessibleDescription(
      "El fin no puede ser anterior al inicio.",
    );
    expect(screen.getByRole("textbox", { name: /Descripción/ })).toHaveAccessibleDescription(
      "Como mucho 500 caracteres.",
    );
  });

  it("shows each field's error and keeps what was typed", async () => {
    const action = vi.fn<NewProjectAction>(async () => ({
      saved: false,
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
    const action = vi.fn<NewProjectAction>(async () => ({
      saved: false,
      error: "no-rate-access",
      errors: {},
    }));
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

const saved: NewProject = {
  name: "Client portal",
  client: "Synthetic Bank",
  pricingModel: "fixed",
  priceCents: 2_000_050,
  plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
  description: "A portal for the bank's clients.",
};

/** Its scenarios' undated recurring costs, which follow the planned period (rule d). */
const scenarios: PeriodScenario[] = [
  { name: "Plan A", chosen: false, undatedRecurringCosts: [{ id: "cloud", label: "Cloud" }] },
  { name: "Plan B", chosen: true, undatedRecurringCosts: [{ id: "licences", label: null }] },
];

async function openEdit(
  action: NewProjectAction,
  locale: "es" | "en" = "es",
  following: PeriodScenario[] = [],
) {
  renderWithIntl(
    <NewProjectSheet
      action={action}
      trigger="edit"
      project={{ id: "p1", saved, scenarios: following }}
    />,
    { locale },
  );
  await userEvent.click(
    screen.getByRole("button", { name: locale === "es" ? "Editar proyecto" : "Edit project" }),
  );
  return screen.getByRole("dialog", { name: locale === "es" ? "Editar proyecto" : "Edit project" });
}

describe("NewProjectSheet, editing a project", () => {
  it("opens with the project filled in, its price typed in the page's locale", async () => {
    await openEdit(succeeding());

    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Client portal");
    expect(screen.getByRole("textbox", { name: "Cliente" })).toHaveValue("Synthetic Bank");
    expect(screen.getByRole("radio", { name: "Precio cerrado" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Precio/ })).toHaveValue("20000,50");
    expect(screen.getByLabelText("Inicio")).toHaveValue("2027-04-01");
    expect(screen.getByLabelText("Fin")).toHaveValue("2027-09-30");
    expect(screen.getByRole("textbox", { name: /Descripción/ })).toHaveValue(
      "A portal for the bank's clients.",
    );
  });

  it("sends the project's id with the form and closes once it is saved", async () => {
    const action = vi.fn<NewProjectAction>(async () => ({ saved: true, error: null, errors: {} }));
    await openEdit(action);

    await userEvent.clear(screen.getByLabelText("Inicio"));
    await userEvent.clear(screen.getByLabelText("Fin"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(Object.fromEntries(action.mock.calls[0]![1].entries())).toMatchObject({
      projectId: "p1",
      plannedStart: "",
      plannedEnd: "",
    });
    expect(screen.getByRole("button", { name: "Editar proyecto" })).toHaveFocus();
  });

  it("says why the project was not saved, and stays open", async () => {
    const action = vi.fn<NewProjectAction>(async () => ({
      saved: false,
      error: "not-found",
      errors: {},
    }));
    await openEdit(action);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este proyecto ya no existe en tu organización.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("names the undated recurring costs a new period moves, and the chosen scenario's", async () => {
    await openEdit(succeeding(), "es", scenarios);
    const end = screen.getByLabelText("Fin");
    const notice = () => screen.queryByRole("list", { name: /costes recurrentes/ });

    expect(notice()).toBeNull();
    await userEvent.clear(end);
    await userEvent.type(end, "2027-12-31");

    const list = notice();
    expect(list).not.toBeNull();
    expect(
      within(list!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Cloud, en Plan A", "Coste sin nombre, en Plan B"]);
    expect(screen.getByText(/Plan B es el escenario elegido/)).toBeInTheDocument();

    // Back to the saved period, nothing moves.
    await userEvent.clear(end);
    await userEvent.type(end, "2027-09-30");
    expect(notice()).toBeNull();
  });

  it("says that clearing the period moves them too, but not while it is incomplete", async () => {
    await openEdit(succeeding(), "es", scenarios);

    await userEvent.clear(screen.getByLabelText("Fin"));
    expect(screen.queryByRole("list", { name: /costes recurrentes/ })).toBeNull();
    await userEvent.clear(screen.getByLabelText("Inicio"));
    expect(screen.getByRole("list", { name: /costes recurrentes/ })).toBeInTheDocument();
  });

  it("says nothing about costs when no scenario has an undated recurring one", async () => {
    await openEdit(succeeding());

    await userEvent.clear(screen.getByLabelText("Inicio"));
    await userEvent.clear(screen.getByLabelText("Fin"));

    expect(screen.queryByRole("list", { name: /costes recurrentes/ })).toBeNull();
  });

  it("names the moving costs in English under /en", async () => {
    await openEdit(succeeding(), "en", scenarios);

    await userEvent.clear(screen.getByLabelText("Start"));
    await userEvent.clear(screen.getByLabelText("End"));

    expect(
      within(screen.getByRole("list", { name: /recurring costs/ }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Cloud, in Plan A", "Unnamed cost, in Plan B"]);
    expect(screen.getByText(/Plan B is the chosen scenario/)).toBeInTheDocument();
  });

  it("speaks English under /en", async () => {
    await openEdit(succeeding(), "en");

    expect(screen.getByRole("textbox", { name: /Price/ })).toHaveValue("20000.50");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    await openEdit(succeeding(), "es", scenarios);
    await userEvent.clear(screen.getByLabelText("Inicio"));
    await userEvent.clear(screen.getByLabelText("Fin"));

    await expectNoAxeViolations();
  });
});
