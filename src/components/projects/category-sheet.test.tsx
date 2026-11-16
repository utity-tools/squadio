import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { CategorySheet, type SaveCategoryAction } from "./category-sheet";

// Board 06's «Añadir categoría» and a row's edit: a side sheet with the category's name and its
// whole rate. It closes once saved; a failure keeps it open with what was typed.

// Radix's radio group measures its hidden input; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const succeeding = () =>
  vi.fn<SaveCategoryAction>(async (_, form) => ({
    saved: String(form.get("name")),
    error: null,
    errors: {},
  }));

const devOps = {
  id: "0b5e0c1e-0000-4000-8000-000000000003",
  name: "DevOps Engineer",
  rate: {
    grossAnnualSalaryCents: 5_000_000,
    socialSecurityBasisPoints: 3100,
    otherYearlyCostsCents: 300_000,
    manualCostPerHourCents: null,
    sellRateCents: 6200,
  },
};

const sent = (action: ReturnType<typeof succeeding>) =>
  Object.fromEntries(action.mock.calls[0]![1].entries());

describe("CategorySheet", () => {
  it("adds a category, starting from the template's social security and other costs", async () => {
    const action = succeeding();
    const onSaved = vi.fn();
    renderWithIntl(<CategorySheet action={action} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Añadir categoría" }));

    expect(screen.getByRole("dialog", { name: "Nueva categoría" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /Seguridad Social/ })).toHaveValue("31");
    expect(screen.getByRole("textbox", { name: /Otros costes/ })).toHaveValue("3000");

    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "DevOps Engineer");
    await userEvent.type(screen.getByRole("textbox", { name: "Salario bruto anual" }), "50.000");
    await userEvent.type(screen.getByRole("textbox", { name: /Tarifa de venta/ }), "62");
    await userEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("DevOps Engineer"));
    expect(sent(action)).toEqual({
      locale: "es",
      salaryPeriod: "year",
      name: "DevOps Engineer",
      salary: "50.000",
      socialSecurity: "31",
      otherCosts: "3000",
      manualCostPerHour: "",
      sellRate: "62",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("takes a monthly salary with its number of payments", async () => {
    const action = succeeding();
    renderWithIntl(<CategorySheet action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Añadir categoría" }));

    await userEvent.click(screen.getByRole("radio", { name: "Mensual" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Salario bruto mensual" }), "2100");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Número de pagas" }), "12");
    await userEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(sent(action)).toMatchObject({ salaryPeriod: "month", salary: "2100", payments: "12" });
  });

  it("edits a category with its rate filled in and its id", async () => {
    const action = succeeding();
    renderWithIntl(<CategorySheet action={action} category={devOps} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar DevOps Engineer" }));

    expect(screen.getByRole("dialog", { name: "Editar categoría" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("DevOps Engineer");
    expect(screen.getByRole("textbox", { name: "Salario bruto anual" })).toHaveValue("50000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(sent(action)).toMatchObject({ categoryId: devOps.id, sellRate: "62" });
  });

  it("warns, while editing, that a small category's rate may reveal a salary (rule j)", async () => {
    renderWithIntl(<CategorySheet action={succeeding()} category={devOps} small />);
    await userEvent.click(screen.getByRole("button", { name: "Editar DevOps Engineer" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Categoría pequeña: su coste puede revelar un salario",
    );
  });

  it("starts the salary afresh when its period changes", async () => {
    renderWithIntl(<CategorySheet action={succeeding()} category={devOps} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar DevOps Engineer" }));

    await userEvent.click(screen.getByRole("radio", { name: "Mensual" }));

    expect(screen.getByRole("textbox", { name: "Salario bruto mensual" })).toHaveValue("");
  });

  it("shows each field's error and keeps the sheet open with what was typed", async () => {
    const action = vi.fn<SaveCategoryAction>(async () => ({
      saved: null,
      error: null,
      errors: { name: "taken", sellRate: "invalid", socialSecurity: "invalid" },
    }));
    renderWithIntl(<CategorySheet action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Añadir categoría" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "DevOps Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));

    const name = await screen.findByRole("textbox", { name: "Nombre" });
    await waitFor(() => expect(name).toBeInvalid());
    expect(name).toHaveAccessibleDescription("Ya hay una categoría con este nombre.");
    expect(name).toHaveValue("DevOps Engineer");
    expect(screen.getByRole("textbox", { name: /Tarifa de venta/ })).toHaveAccessibleDescription(
      /Escribe un importe en euros/,
    );
    expect(screen.getByRole("textbox", { name: /Seguridad Social/ })).toHaveAccessibleDescription(
      /Escribe un porcentaje/,
    );
  });

  it("says why the category was not saved", async () => {
    const action = vi.fn<SaveCategoryAction>(async () => ({
      saved: null,
      error: "no-rate-access",
      errors: {},
    }));
    renderWithIntl(<CategorySheet action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Añadir categoría" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Guardar costes necesita acceso a tarifas.",
    );
  });

  it("speaks English under /en", async () => {
    renderWithIntl(<CategorySheet action={succeeding()} />, { locale: "en" });
    await userEvent.click(screen.getByRole("button", { name: "Add category" }));

    expect(screen.getByRole("textbox", { name: "Gross annual salary" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<CategorySheet action={succeeding()} />);
    await userEvent.click(screen.getByRole("button", { name: "Añadir categoría" }));
    await userEvent.click(screen.getByRole("radio", { name: "Mensual" }));

    await expectNoAxeViolations();
  });
});
