import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { CategoryCosts } from "./category-costs";
import type { SaveCategoryAction } from "./category-sheet";

// Board 06's «Categorías y costes»: the organization's categories with their costs, read with rate
// access, pending without a rate (rule k) and warned when small (rule j).

const rate = {
  grossAnnualSalaryCents: 5_000_000,
  socialSecurityBasisPoints: 3100,
  otherYearlyCostsCents: 300_000,
  manualCostPerHourCents: null,
  sellRateCents: 6200,
};
const categories = [
  { id: "c-devops", name: "DevOps Engineer", rate },
  { id: "c-pm", name: "Project Manager", rate: null },
];
const people = [
  { id: "p1", categoryId: "c-devops", active: true },
  { id: "p2", categoryId: "c-pm", active: true },
  { id: "p3", categoryId: "c-pm", active: true },
  { id: "p4", categoryId: "c-pm", active: true },
];
const action = vi.fn<SaveCategoryAction>();

const render = (props: Partial<Parameters<typeof CategoryCosts>[0]> = {}) =>
  renderWithIntl(
    <CategoryCosts
      netAnnualHours={1550}
      categories={categories}
      people={people}
      pricingModel="fixed"
      action={action}
      {...props}
    />,
  );

describe("CategoryCosts", () => {
  it("shows each category's fully loaded cost, cost per hour and sell rate", () => {
    render();
    const row = screen.getByRole("row", { name: /DevOps Engineer/ });
    expect(row).toHaveTextContent(/68\.500\s€/);
    expect(row).toHaveTextContent(/44,19\s€\/h/);
    expect(row).toHaveTextContent(/62,00\s€\/h/);
    expect(within(row).getByText("Completa")).toBeInTheDocument();
  });

  it("leaves a category without a rate pending, never at 0", () => {
    render();
    const row = screen.getByRole("row", { name: /Project Manager/ });
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    expect(row).toHaveTextContent("Falta el coste y la tarifa de venta");
    expect(row).not.toHaveTextContent("0,00");
  });

  it("warns about a category with 1 or 2 active people only", () => {
    render();
    const warning = "Categoría pequeña: su coste puede revelar un salario";
    expect(
      within(screen.getByRole("row", { name: /DevOps Engineer/ })).getByText(warning),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Project Manager/ })).queryByText(warning),
    ).toBeNull();
  });

  it("marks a manual cost per hour", () => {
    render({
      categories: [{ ...categories[0]!, rate: { ...rate, manualCostPerHourCents: 5000 } }],
    });
    expect(screen.getByRole("row", { name: /DevOps Engineer/ })).toHaveTextContent(
      /50,00\s€\/h\s*\(manual\)/,
    );
  });

  it("offers adding and editing to a member with rate access", () => {
    render();
    expect(screen.getByRole("button", { name: "Añadir categoría" })).toBeInTheDocument();
    // ADR 0016: or importing them from a spreadsheet.
    expect(
      screen.getByRole("link", { name: "Importar desde una hoja de cálculo" }),
    ).toHaveAttribute("href", "/import");
    expect(screen.getByRole("button", { name: "Editar Project Manager" })).toBeInTheDocument();
  });

  it("offers no writing to a visitor or the demo", () => {
    render({ action: null });
    expect(screen.queryByRole("button", { name: "Añadir categoría" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Importar/ })).toBeNull();
  });

  it("says what the sell rate is for under each pricing model", () => {
    const { unmount } = render();
    expect(screen.getByText(/solo hace falta para comparar/)).toBeInTheDocument();
    unmount();
    render({ pricingModel: "time_and_materials" });
    expect(screen.getByText(/la tarifa de venta da los ingresos/)).toBeInTheDocument();
  });

  it("says there are no categories yet", () => {
    render({ categories: [] });
    expect(screen.getByText(/Aún no hay categorías/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    render();
    await expectNoAxeViolations();
  });
});
