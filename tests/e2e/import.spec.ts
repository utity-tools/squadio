import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import { copyId } from "@/lib/visitors/copy-id";

import { expectNoAxeViolations } from "./support/axe";
import { expectHydrated } from "./support/hydration";
import { expect, test } from "./support/signed-in";

// ADR 0016 and boards 10 to 13: a member imports the organization's categories and their costs,
// then its people, from two CSV files in four steps each, reached from «Categorías y costes», or
// the people file alone from «Personas». The file is read in the browser;
// the Server Action writes every row or none. Each test signs in an account of its own, in an
// organization holding a copy of the demo's synthetic rows. Needs the demo organization
// (`pnpm db:migrate` and `pnpm db:seed`).

const PORTAL = "6d656d6f-0000-4000-8000-000000000100";

// The template's header; «Data Engineer» exists in the demo without a rate (rule k).
const FILE = [
  "categoria;salario_bruto_anual;seguridad_social_pct;otros_costes_anuales;tarifa_venta_hora;coste_hora_manual",
  "QA Engineer;38.000;;;45;",
  "Data Engineer;60.000;31;3.000;80;",
  "UX Designer;40.000;131;3.000;55;",
].join("\n");

const fileInput = (page: Page) => page.getByLabel("Archivo CSV de categorías y costes");
const primary = (page: Page, name: string | RegExp) =>
  page.getByRole("main").getByRole("button", { name });

async function expectAccessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAxeViolations(page);
  }
}

test("a member imports categories from «Categorías y costes», fixing a cell on the way", async ({
  page,
  signInAs,
}) => {
  const member = await signInAs("member");
  await page.goto(`/projects/${copyId(PORTAL, member.organizationId)}`);
  await page.getByRole("link", { name: "Importar desde una hoja de cálculo" }).click();

  // 1. Upload.
  await expect(page).toHaveURL("/import");
  await expect(
    page.getByRole("heading", { level: 1, name: "Importar desde una hoja de cálculo" }),
  ).toBeVisible();
  await expectHydrated(primary(page, "Continuar"));
  await expect(primary(page, "Continuar")).toHaveAttribute("aria-disabled", "true");
  await expectAccessible(page);
  await fileInput(page).setInputFiles({
    name: "costes_2027.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(FILE),
  });
  await expect(page.getByRole("main").getByRole("status")).toHaveText("costes_2027.csv · 3 filas");
  await primary(page, "Continuar").click();

  // 2. Columns: the template's headers match by themselves.
  await expect(page.getByRole("heading", { name: "Empareja tus columnas" })).toBeFocused();
  await expect(
    page.getByRole("combobox", { name: "Campo de Squadio para «categoria»" }),
  ).toHaveValue("name");
  await expect(page.getByText(/Están emparejados los campos obligatorios/)).toBeVisible();
  await expectAccessible(page);
  await primary(page, "Revisar 3 filas").click();

  // 3. Review: one error, its report, and the fix in place.
  await expect(page.getByRole("heading", { name: "Revisa las filas" })).toBeFocused();
  const ux = page.getByRole("row", { name: /UX Designer/ });
  await expect(ux.getByText("Entre 0 y 100 %.")).toBeVisible();
  await expect(primary(page, "Importar 3 categorías")).toHaveAttribute("aria-disabled", "true");
  await expectAccessible(page);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar informe de errores" }).click();
  const report = await readFile(await (await download).path(), "utf8");
  expect(report).toContain("fila;categoria");
  expect(report).toContain("4;UX Designer;40.000;131;3.000;55;");
  expect(report).not.toContain("QA Engineer");

  // With the keyboard: the cell's button opens an input, Enter keeps the fix.
  await ux.getByRole("button", { name: /Corregir Seguridad social % de la fila 4/ }).focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Seguridad social % de la fila 4" });
  await expect(input).toBeFocused();
  await input.fill("31");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/2 categorías nuevas y 1 que ya existe y se actualizará/),
  ).toBeVisible();

  // 4. Import.
  await primary(page, "Importar 3 categorías").click();
  await expect(page.getByRole("heading", { name: "Categorías importadas" })).toBeFocused();
  await expect(page.getByText("2 categorías creadas y 1 actualizada.")).toBeVisible();
  await expectAccessible(page);

  await page.goto(`/projects/${copyId(PORTAL, member.organizationId)}`);
  const costs = page.getByRole("table", { name: "Categorías y costes" });
  await expect(costs.getByRole("row", { name: /^QA Engineer/ })).toContainText(/45,00\s€\/h/);
  await expect(costs.getByRole("row", { name: /^Data Engineer/ })).toContainText("Completa");
  await expect(costs.getByRole("row", { name: /^UX Designer/ })).toContainText(/55,00\s€\/h/);
});

test("a file refused whole says why and stays on the upload", async ({ page, signInAs }) => {
  await signInAs("owner");
  await page.goto("/en/import");
  await expectHydrated(primary(page, "Continue"));
  await page.getByLabel("CSV file of categories and costs").setInputFiles({
    name: "categories.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("category"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/only has its header row/);
  await expect(primary(page, "Continue")).toHaveAttribute("aria-disabled", "true");
});

test("a viewer is not offered the import", async ({ page, signInAs }) => {
  const viewer = await signInAs("viewer");
  await page.goto(`/projects/${copyId(PORTAL, viewer.organizationId)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Customer portal" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Importar/ })).toHaveCount(0);

  await page.goto("/import");
  await expect(
    page.getByRole("heading", { level: 1, name: "No puedes importar en esta organización" }),
  ).toBeVisible();
  await expect(page.getByLabel("Archivo CSV de categorías y costes")).toHaveCount(0);
});

test("a visitor of the demo is not offered the import", async ({ page }) => {
  await page.goto(`/projects/${PORTAL}`);
  await expect(page.getByRole("table", { name: "Categorías y costes" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Importar/ })).toHaveCount(0);

  await page.goto("/import");
  await expect(
    page.getByRole("heading", { level: 1, name: "No puedes importar en esta organización" }),
  ).toBeVisible();
});

// Board 13. The demo's «Senior Developer 1» is updated by name; «Cloud Architect» does not exist,
// so it is created without a rate (rule k). The salary column is left out and never sent.
const PEOPLE = [
  "nombre;categoria;jornada_semanal;area;salario",
  "senior developer 1;QA Engineer;32,5;;41000",
  "Persona 20;QA Engineer;;Calidad;38000",
  "Persona 21;Cloud Architect;40;;45000",
].join("\n");

const peopleTable = (page: Page) => page.getByRole("table", { name: "Personas" });

test("a member imports the people after the categories, as the second file", async ({
  page,
  signInAs,
}) => {
  await signInAs("member");
  await page.goto("/import");
  await expectHydrated(primary(page, "Continuar"));
  await fileInput(page).setInputFiles({
    name: "costes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ["categoria;salario_bruto_anual;tarifa_venta_hora", "QA Engineer;38.000;45"].join("\n"),
    ),
  });
  await primary(page, "Continuar").click();
  await primary(page, "Revisar 1 fila").click();
  await primary(page, "Importar 1 categoría").click();
  await page.getByRole("button", { name: "Continuar con personas" }).click();

  // The people file, said to follow the categories.
  await expect(page.getByRole("heading", { name: "Sube tu archivo" })).toBeFocused();
  await expect(page.getByText("1 categoría importada.")).toBeVisible();
  await expect(page.getByText(/Archivo 2 de 2/)).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Archivo CSV de personas").setInputFiles({
    name: "equipo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(PEOPLE),
  });
  await primary(page, "Continuar").click();
  await expect(page.getByRole("combobox", { name: "Campo de Squadio para «salario»" })).toHaveValue(
    "",
  );
  await primary(page, "Revisar 3 filas").click();

  const cloud = page.getByRole("row", { name: /Persona 21/ });
  await expect(cloud.getByText("No existe: se creará con coste Pendiente.")).toBeVisible();
  await expect(
    page.getByText(
      "2 personas nuevas, 1 que ya existe y se actualizará y 1 categoría nueva, sin coste.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("41000");
  await expectAccessible(page);

  await primary(page, "Importar 3 personas").click();
  await expect(page.getByRole("heading", { name: "Personas importadas" })).toBeFocused();
  await expect(page.getByText("2 personas creadas y 1 actualizada.")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Ir a personas" }).click();
  // Keeps the existing spelling; an empty cell keeps the area.
  const senior = peopleTable(page).getByRole("row", { name: /^Senior Developer 1/ });
  await expect(senior).toContainText("QA Engineer");
  await expect(senior).toContainText(/32,5\sh\/sem/);
  await expect(peopleTable(page).getByRole("row", { name: /^Persona 20/ })).toContainText(
    "Calidad",
  );
  await expect(peopleTable(page).getByRole("row", { name: /^Persona 21/ })).toContainText(
    "Cloud Architect",
  );
});

test("an owner imports the people alone from «Personas», fixing a repeated name", async ({
  page,
  signInAs,
}) => {
  await signInAs("owner");
  await page.goto("/people");
  await page.getByRole("link", { name: "Importar desde una hoja de cálculo" }).click();

  await expect(page).toHaveURL("/import?file=people");
  await expectHydrated(primary(page, "Continuar"));
  await expect(page.getByRole("button", { name: "Descargar plantilla de personas" })).toBeVisible();
  await page.getByLabel("Archivo CSV de personas").setInputFiles({
    name: "equipo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ["nombre;categoria", "Persona 30;Senior Developer", "persona 30;Senior Developer"].join("\n"),
    ),
  });
  await primary(page, "Continuar").click();
  await primary(page, "Revisar 2 filas").click();

  const repeated = page.getByRole("row", { name: /persona 30/ });
  await expect(repeated.getByText("Repite la fila 2.")).toBeVisible();
  await expect(primary(page, "Importar 2 personas")).toHaveAttribute("aria-disabled", "true");

  await repeated.getByRole("button", { name: /Corregir Nombre de la fila 3/ }).focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Nombre de la fila 3" });
  await expect(input).toBeFocused();
  await input.fill("Persona 31");
  await page.keyboard.press("Enter");
  await primary(page, "Importar 2 personas").click();
  await expect(page.getByRole("heading", { name: "Personas importadas" })).toBeFocused();

  await page.goto("/people");
  await expect(peopleTable(page).getByRole("row", { name: /^Persona 3[01]/ })).toHaveCount(2);
});

test("a viewer is not offered the people import", async ({ page, signInAs }) => {
  await signInAs("viewer");
  await page.goto("/people");
  await expect(peopleTable(page)).toBeVisible();
  await expect(page.getByRole("link", { name: /hoja de cálculo/ })).toHaveCount(0);

  await page.goto("/import?file=people");
  await expect(
    page.getByRole("heading", { level: 1, name: "No puedes importar en esta organización" }),
  ).toBeVisible();
  await expect(page.getByLabel("Archivo CSV de personas")).toHaveCount(0);
});
