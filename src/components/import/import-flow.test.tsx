import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { type ImportCategoriesAction, ImportFlow, type ImportPeopleAction } from "./import-flow";

vi.mock("next/navigation", () => import("@/test/navigation"));

// Boards 10 to 13: a categories file, then a people file, uploaded, their columns matched, their
// rows reviewed and fixed, then imported all or none (ADR 0016). A file never leaves the browser:
// only matched rows do.

const action = vi.fn<ImportCategoriesAction>();
const peopleAction = vi.fn<ImportPeopleAction>();
const existing = [{ id: "c-senior", name: "Senior Developer", hasRate: true }];
const peopleContext = {
  people: [{ id: "p-01", name: "Persona 01", categoryId: "c-senior" }],
  categories: [...existing, { id: "c-manager", name: "Project Manager", hasRate: false }],
  defaultWeeklyHours: 40,
};

const FILE = [
  "Perfil;Bruto anual;SS %;Otros;Precio hora;Departamento",
  "Senior developer;55.000;;;;Desarrollo",
  "QA Engineer;38.000;31;3.000;45;Calidad",
  "UX Designer;40.000;131;3.000;55;Diseño",
].join("\n");

const csv = (text: string, name = "costes_2027.csv") =>
  new File([text], name, { type: "text/csv" });

const render = (start: "categories" | "people" = "categories") =>
  renderWithIntl(
    <ImportFlow
      start={start}
      categories={existing}
      people={peopleContext}
      importCategories={action}
      importPeople={peopleAction}
    />,
  );

async function uploadAndMatch(user: ReturnType<typeof userEvent.setup>, text = FILE) {
  await user.upload(screen.getByLabelText("Archivo CSV de categorías y costes"), csv(text));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue({ ok: true, creates: 1, updates: 1 });
  peopleAction.mockReset();
  peopleAction.mockResolvedValue({ ok: true, creates: 2, updates: 1, newCategories: 1 });
});

describe("ImportFlow, categories file", () => {
  it("starts at the upload, with the template and the steps", async () => {
    render();
    expect(screen.getByRole("heading", { name: "Sube tu archivo" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Pasos de la importación" });
    expect(within(steps).getByText("Subir").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Descargar plantilla de categorías" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveAccessibleDescription(
      "Sube un archivo para seguir.",
    );
    await expectNoAxeViolations();
  });

  it("refuses a file over 1 MB before reading it", async () => {
    const user = userEvent.setup();
    render();
    const big = csv("x".repeat(1024 * 1024 + 1));
    await user.upload(screen.getByLabelText("Archivo CSV de categorías y costes"), big);
    expect(screen.getByRole("alert")).toHaveTextContent("pesa más de 1 MB");
  });

  it("says why a file is refused whole", async () => {
    const user = userEvent.setup();
    render();
    await user.upload(
      screen.getByLabelText("Archivo CSV de categorías y costes"),
      csv("categoria"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("solo tiene la fila de cabecera");
  });

  it("suggests a field for each column and leaves the rest out", async () => {
    const user = userEvent.setup();
    render();
    await uploadAndMatch(
      user,
      ["categoria;salario_bruto_anual;Departamento", "QA Engineer;38.000;Calidad"].join("\n"),
    );
    expect(screen.getByRole("heading", { name: "Empareja tus columnas" })).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Campo de Squadio para «categoria»" })).toHaveValue(
      "name",
    );
    expect(
      screen.getByRole("combobox", { name: "Campo de Squadio para «Departamento»" }),
    ).toHaveValue("");
    await expectNoAxeViolations();
  });

  it("asks for the required fields before the review", async () => {
    const user = userEvent.setup();
    render();
    await uploadAndMatch(user);
    // None of the file's headers is the template's: nothing is matched.
    expect(screen.getByText(/Falta emparejar Categoría/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Revisar 3 filas" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Campo de Squadio para «Perfil»" }),
      "name",
    );
    expect(screen.getByText(/Están emparejados los campos obligatorios/)).toBeVisible();
  });

  /** Uploads FILE and matches its columns by hand, as board 11 draws them. */
  async function toReview(user: ReturnType<typeof userEvent.setup>) {
    await uploadAndMatch(user);
    const fields = [
      ["Perfil", "name"],
      ["Bruto anual", "grossAnnualSalary"],
      ["SS %", "socialSecurity"],
      ["Otros", "otherYearlyCosts"],
      ["Precio hora", "sellRate"],
    ];
    for (const [column, field] of fields) {
      await user.selectOptions(
        screen.getByRole("combobox", { name: `Campo de Squadio para «${column}»` }),
        field ?? "",
      );
    }
    await user.click(screen.getByRole("button", { name: "Revisar 3 filas" }));
  }

  it("carries no amount in the messages every page receives (ADR 0005)", async () => {
    const { default: es } = await import("../../../messages/es.json");
    const { default: en } = await import("../../../messages/en.json");
    expect(JSON.stringify([es.Import, en.Import])).not.toContain("€");
  });

  it("words the template's values for a new category's empty cells", async () => {
    const user = userEvent.setup();
    render();
    await uploadAndMatch(
      user,
      ["categoria;salario_bruto_anual;tarifa_venta_hora", "QA Engineer;38.000;45"].join("\n"),
    );
    await user.click(screen.getByRole("button", { name: "Revisar 1 fila" }));
    expect(screen.queryByRole("columnheader", { name: "Seguridad social %" })).toBeNull();
    expect(screen.getByText("Con aviso").nextSibling).toHaveTextContent("1");
    const row = screen.getByRole("row", { name: /QA Engineer/ });
    expect(row).toHaveTextContent(/Vacía: se usa el 31\s%\sde la plantilla\./);
    expect(row).toHaveTextContent(/Vacía: se usan los 3000\s€ de la plantilla\./);
  });

  it("reviews every row and shows a row's errors only", async () => {
    const user = userEvent.setup();
    render();
    await toReview(user);
    expect(screen.getByRole("heading", { name: "Revisa las filas" })).toHaveFocus();
    expect(screen.getByText("Listas").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Con error").nextSibling).toHaveTextContent("1");
    const ux = screen.getByRole("row", { name: /UX Designer/ });
    expect(within(ux).getByText("Entre 0 y 100 %.")).toBeVisible();
    expect(within(ux).queryByText(/plantilla/)).not.toBeInTheDocument();
    expect(screen.getByText(/Corrige el error para importar/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Importar 3 categorías" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectNoAxeViolations();
  });

  it("fixes a cell in place and imports every row", async () => {
    const user = userEvent.setup();
    render();
    await toReview(user);
    await user.click(
      screen.getByRole("button", { name: "Corregir Seguridad social % de la fila 4: 131" }),
    );
    const input = screen.getByRole("textbox", { name: "Seguridad social % de la fila 4" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "31{Enter}");
    expect(screen.getByText("Con error").nextSibling).toHaveTextContent("0");
    // The fixed cell is no longer a button: the focus goes back to the step, never to the page.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Revisa las filas" })).toHaveFocus(),
    );
    expect(screen.getByText(/2 categorías nuevas y 1 que ya existe/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Importar 3 categorías" }));
    expect(action).toHaveBeenCalledWith({
      locale: "es",
      rows: expect.arrayContaining([
        expect.objectContaining({
          row: 4,
          cells: expect.objectContaining({ name: "UX Designer", socialSecurity: "31" }),
        }),
      ]),
    });
    // The column left out is never sent.
    expect(JSON.stringify(action.mock.calls[0])).not.toContain("Diseño");
    expect(await screen.findByRole("heading", { name: "Categorías importadas" })).toHaveFocus();
    expect(screen.getByText("1 categoría creada y 1 actualizada.")).toBeVisible();
  });

  it("says when the server refuses the rows, and imports nothing", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ ok: false, error: "rows-changed" });
    render();
    await toReview(user);
    await user.click(
      screen.getByRole("button", { name: "Corregir Seguridad social % de la fila 4: 131" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /fila 4/ }),
      "{Control>}a{/Control}31{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Importar 3 categorías" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("han cambiado mientras revisabas");
    expect(
      screen.queryByRole("heading", { name: "Categorías importadas" }),
    ).not.toBeInTheDocument();
  });
});

// Board 13: the people file, after the categories or alone, from «Personas».
const PEOPLE = [
  "nombre;categoria;jornada_semanal;area;salario",
  "Persona 01;Senior Developer;40;;41000",
  "Persona 02;Cloud Architect;40;Cloud;38000",
  "Persona 03;Project Manager;40;;45000",
  "persona 03;Project Manager;32;;45000",
].join("\n");

describe("ImportFlow, people file", () => {
  async function toPeopleReview(user: ReturnType<typeof userEvent.setup>) {
    await user.upload(screen.getByLabelText("Archivo CSV de personas"), csv(PEOPLE, "equipo.csv"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    // The template's names match by themselves; the salary column is left out.
    expect(screen.getByRole("combobox", { name: "Campo de Squadio para «salario»" })).toHaveValue(
      "",
    );
    await user.click(screen.getByRole("button", { name: "Revisar 4 filas" }));
  }

  it("starts at the people file alone, as «Personas» leads here", async () => {
    render("people");
    expect(screen.getByText(/Archivo 2 de 2/)).toBeVisible();
    const files = within(screen.getByRole("list", { name: "Archivos" })).getAllByRole("listitem");
    expect(files).toHaveLength(2);
    expect(files[0]).toHaveTextContent("1. Categorías y costes");
    expect(files[1]).toHaveTextContent("2. Personas");
    expect(files[1]).toHaveAttribute("aria-current", "step");
    expect(files[0]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Descargar plantilla de personas" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/people");
    await expectNoAxeViolations();
  });

  it("reviews people: a missing category is a warning, a repeated name an error", async () => {
    const user = userEvent.setup();
    render("people");
    await toPeopleReview(user);
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Jornada semanal" })).toBeVisible();
    const cloud = screen.getByRole("row", { name: /Persona 02/ });
    expect(within(cloud).getByText("No existe: se creará con coste Pendiente.")).toBeVisible();
    expect(within(cloud).getByText("Aviso")).toBeVisible();
    const repeated = screen.getByRole("row", { name: /persona 03/ });
    expect(within(repeated).getByText("Repite la fila 4.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Importar 4 personas" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectNoAxeViolations();
  });

  it("fixes the repeated name and imports every person, never the salary column", async () => {
    const user = userEvent.setup();
    render("people");
    await toPeopleReview(user);
    await user.click(
      screen.getByRole("button", { name: "Corregir Nombre de la fila 5: persona 03" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Nombre de la fila 5" }),
      "{Control>}a{/Control}Persona 04{Enter}",
    );
    expect(
      screen.getByText(
        "3 personas nuevas, 1 que ya existe y se actualizará y 1 categoría nueva, sin coste.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Importar 4 personas" }));
    expect(peopleAction).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        expect.objectContaining({
          row: 5,
          cells: { name: "Persona 04", category: "Project Manager", weeklyHours: "32", area: "" },
        }),
      ]),
    });
    expect(JSON.stringify(peopleAction.mock.calls[0])).not.toContain("41000");
    expect(await screen.findByRole("heading", { name: "Personas importadas" })).toHaveFocus();
    expect(screen.getByText("2 personas creadas y 1 actualizada.")).toBeVisible();
    expect(screen.getByText(/La categoría nueva tiene su coste pendiente/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir a personas" })).toHaveAttribute("href", "/people");
  });

  it("follows the categories file, saying what it imported", async () => {
    const user = userEvent.setup();
    render();
    await uploadAndMatch(
      user,
      ["categoria;salario_bruto_anual;tarifa_venta_hora", "QA Engineer;38.000;45"].join("\n"),
    );
    await user.click(screen.getByRole("button", { name: "Revisar 1 fila" }));
    await user.click(screen.getByRole("button", { name: "Importar 1 categoría" }));
    await user.click(await screen.findByRole("button", { name: "Continuar con personas" }));
    const upload = screen.getByRole("heading", { name: "Sube tu archivo" });
    expect(upload).toHaveFocus();
    // The focus lands on the heading: it carries what the categories file imported.
    expect(upload).toHaveAccessibleDescription("2 categorías importadas. Ahora las personas.");
    expect(screen.getByText("2 categorías importadas.").closest("[role=status]")).toHaveTextContent(
      "2 categorías importadas. Ahora las personas.",
    );
    expect(screen.getByLabelText("Archivo CSV de personas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/projects");
    await expectNoAxeViolations();
  });
});
