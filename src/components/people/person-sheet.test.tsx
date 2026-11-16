import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { PersonSheet, type SavePersonAction } from "./person-sheet";

// Board 07's «Añadir persona» and a row's edit: name, category, weekly hours, area and whether
// the person is active. Never a salary. Rule j warns before a save makes a category small.

const DEVOPS = "0b5e0c1e-0000-4000-8000-000000000003";
const PM = "0b5e0c1e-0000-4000-8000-000000000004";
const categories = [
  { id: DEVOPS, name: "DevOps Engineer" },
  { id: PM, name: "Project Manager" },
];
// Two active project managers and no DevOps yet; DevOps has no rate.
const headcount = [
  { id: "a", categoryId: PM, active: true },
  { id: "b", categoryId: PM, active: true },
];
const rates = { pending: [DEVOPS], headcount };

const succeeding = () =>
  vi.fn<SavePersonAction>(async (_, form) => ({
    saved: String(form.get("name")),
    error: null,
    errors: {},
  }));

const sent = (action: ReturnType<typeof succeeding>, call = 0) =>
  Object.fromEntries(action.mock.calls[call]![1].entries());

const laura = {
  id: "0b5e0c1e-0000-4000-8000-000000000005",
  name: "Laura Gómez",
  categoryId: PM,
  weeklyHours: 37.5,
  area: "Plataforma",
  active: true,
};

const open = async (name: string) => {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
};

describe("PersonSheet", () => {
  it("adds a person, starting active with the organization's weekly hours", async () => {
    const action = succeeding();
    const onSaved = vi.fn();
    renderWithIntl(
      <PersonSheet
        action={action}
        categories={categories}
        rates={rates}
        defaultWeeklyHours={40}
        onSaved={onSaved}
      />,
    );
    const dialog = await open("Añadir persona");
    expect(dialog).toHaveAccessibleName("Añadir persona");
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /Jornada/ })).toHaveValue("40");
    expect(screen.getByRole("checkbox", { name: "Activa" })).toBeChecked();
    expect(screen.queryByText(/salario/i)).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Pablo Ruiz");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), PM);
    await userEvent.type(screen.getByRole("textbox", { name: /Área/ }), "Plataforma");
    await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Pablo Ruiz"));
    expect(sent(action)).toEqual({
      name: "Pablo Ruiz",
      categoryId: PM,
      weeklyHours: "40",
      area: "Plataforma",
      active: "on",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open for the next person with «Añadir otra después»", async () => {
    const action = succeeding();
    const onSaved = vi.fn();
    renderWithIntl(
      <PersonSheet
        action={action}
        categories={categories}
        rates={rates}
        defaultWeeklyHours={40}
        onSaved={onSaved}
      />,
    );
    await open("Añadir persona");
    await userEvent.click(screen.getByRole("checkbox", { name: "Añadir otra después" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Pablo Ruiz");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), PM);
    await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue(""));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus());
    expect(screen.getByRole("checkbox", { name: "Añadir otra después" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Persona «Pablo Ruiz» guardada");
    // The next person is likely of the same category; the sheet alone announces the save.
    expect(screen.getByRole("combobox", { name: "Categoría" })).toHaveValue(PM);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("warns when the save leaves the category with 1 or 2 active people (rule j)", async () => {
    renderWithIntl(
      <PersonSheet
        action={succeeding()}
        categories={categories}
        rates={rates}
        defaultWeeklyHours={40}
      />,
    );
    await open("Añadir persona");
    const category = screen.getByRole("combobox", { name: "Categoría" });

    await userEvent.selectOptions(category, DEVOPS);
    expect(screen.getByText(/DevOps Engineer tendrá 1 persona activa/)).toBeInTheDocument();
    // DevOps has no rate yet: the person may still be added.
    expect(screen.getByText(/aún no tiene coste ni tarifa de venta/)).toBeInTheDocument();

    // A third project manager makes theirs an average.
    await userEvent.selectOptions(category, PM);
    expect(screen.queryByText(/persona activa|personas activas/)).not.toBeInTheDocument();
    expect(screen.queryByText(/aún no tiene coste/)).not.toBeInTheDocument();

    // An inactive person draws no salary: DevOps keeps none.
    await userEvent.selectOptions(category, DEVOPS);
    await userEvent.click(screen.getByRole("checkbox", { name: "Activa" }));
    expect(screen.queryByText(/persona activa|personas activas/)).not.toBeInTheDocument();
  });

  it("edits a person, filled in, and warns when deactivating them leaves the category small", async () => {
    const action = succeeding();
    renderWithIntl(
      <PersonSheet
        action={action}
        categories={categories}
        rates={{
          pending: [],
          headcount: [...headcount, { id: laura.id, categoryId: PM, active: true }],
        }}
        defaultWeeklyHours={40}
        person={laura}
      />,
    );
    const dialog = await open("Editar Laura Gómez");
    expect(dialog).toHaveAccessibleName("Editar persona");
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Laura Gómez");
    expect(screen.getByRole("combobox", { name: "Categoría" })).toHaveValue(PM);
    expect(screen.getByRole("textbox", { name: /Jornada/ })).toHaveValue("37,5");
    expect(screen.queryByRole("checkbox", { name: "Añadir otra después" })).not.toBeInTheDocument();
    expect(screen.queryByText(/personas activas/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Activa" }));
    expect(screen.getByText(/Project Manager tendrá 2 personas activas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(sent(action)).toMatchObject({ personId: laura.id, name: "Laura Gómez" });
    expect(sent(action)).not.toHaveProperty("active");
  });

  it("keeps what was typed and shows each field's error", async () => {
    const action = vi.fn<SavePersonAction>(async () => ({
      saved: null,
      error: null,
      errors: { name: "blank", weeklyHours: "invalid" },
    }));
    renderWithIntl(
      <PersonSheet action={action} categories={categories} rates={rates} defaultWeeklyHours={40} />,
    );
    await open("Añadir persona");
    const hours = screen.getByRole("textbox", { name: /Jornada/ });
    await userEvent.clear(hours);
    await userEvent.type(hours, "200");
    await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));

    expect(await screen.findByText("Rellena este campo.")).toBeInTheDocument();
    expect(screen.getByText(/Escribe las horas de una semana/)).toBeInTheDocument();
    expect(hours).toHaveValue("200");
    expect(hours).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps what was typed and says it failed when the request does", async () => {
    const action = vi.fn<SavePersonAction>(async () => {
      throw new Error("offline");
    });
    renderWithIntl(
      <PersonSheet action={action} categories={categories} rates={rates} defaultWeeklyHours={40} />,
    );
    await open("Añadir persona");
    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Pablo Ruiz");
    await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No se ha podido guardar/);
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Pablo Ruiz");
  });

  it("says why the server refused", async () => {
    const action = vi.fn<SavePersonAction>(async () => ({
      saved: null,
      error: "no-rate-access",
      errors: {},
    }));
    renderWithIntl(
      <PersonSheet action={action} categories={categories} rates={rates} defaultWeeklyHours={40} />,
    );
    await open("Añadir persona");
    await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/acceso a tarifas/);
  });

  it("has no axe violations", async () => {
    renderWithIntl(
      <PersonSheet
        action={succeeding()}
        categories={categories}
        rates={rates}
        defaultWeeklyHours={40}
      />,
    );
    await open("Añadir persona");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), DEVOPS);
    await expectNoAxeViolations();
  });
});
