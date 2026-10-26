import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { TeamAssignment } from "@/db/load-scenario";
import { layoutTeam } from "@/lib/layout/compact-layout";
import { assignmentCards } from "@/lib/team-tree/cards";
import { renderWithIntl } from "@/test/render";

import { type TeamTableProps, TeamTable } from "./team-table";

const span = { start: "2027-04-01", end: "2027-09-29", workingDays: 130 };

const seat = { weeklyHours: 40, startDate: span.start, endDate: span.end };

/** The guide case plus a developer under the tech lead, so a row below the root has reports. */
const team: TeamAssignment[] = [
  {
    ...seat,
    id: "pm",
    projectRole: "Project manager",
    category: { id: "c-pm", name: "Project Manager" },
    person: { id: "p-pm", name: "Project Manager 1" },
    reportsTo: null,
    allocation: 50,
  },
  {
    ...seat,
    id: "lead",
    projectRole: "Tech lead",
    category: { id: "c-senior", name: "Senior Developer" },
    person: { id: "p-senior", name: "Senior Developer 1" },
    reportsTo: "pm",
    allocation: 100,
  },
  {
    ...seat,
    id: "dev",
    projectRole: "Backend developer",
    category: { id: "c-back", name: "Backend Developer" },
    person: { id: "p-back", name: "Backend Developer 1" },
    reportsTo: "lead",
    allocation: 100,
  },
  {
    ...seat,
    id: "front",
    projectRole: "",
    category: { id: "c-front", name: "Frontend Developer" },
    person: { id: "p-front", name: "Frontend Developer 1" },
    reportsTo: "pm",
    allocation: 100,
    endDate: "2027-06-30",
  },
  {
    ...seat,
    id: "ops",
    projectRole: "DevOps engineer",
    category: { id: "c-ops", name: "DevOps Engineer" },
    person: null,
    reportsTo: "pm",
    allocation: 50,
  },
];

const hours = team.map(({ id }) => ({ id, nominalHours: 1040, effectiveHours: 897.5 }));

const layout = layoutTeam(team);
if (!layout.ok) throw new Error("expected a layout");

const data = {
  team: team.map(({ id, reportsTo }) => ({ id, reportsTo })),
  nodes: layout.nodes,
  cards: assignmentCards(team, hours, span),
};

/** The table with its state held here, as the scenario page will hold it. */
function Stateful(props: Partial<TeamTableProps>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  return (
    <TeamTable
      {...data}
      selected={selected}
      onSelect={setSelected}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      {...props}
    />
  );
}

/** The body rows, by their first cell's text. */
const row = (name: string) =>
  screen
    .getAllByRole("row")
    .find(
      (candidate) =>
        candidate.dataset.row !== undefined &&
        within(candidate).getAllByRole("gridcell")[0]?.textContent === name,
    )!;

const bodyRows = () =>
  screen
    .getAllByRole("row")
    .filter((candidate) => candidate.dataset.row !== undefined && candidate.closest("tbody"));

const cells = (name: string) =>
  within(row(name))
    .getAllByRole("gridcell")
    .map((cell) => cell.textContent);

describe("TeamTable", () => {
  it("is a labelled treegrid with instructions and the brief's columns", () => {
    renderWithIntl(<Stateful />);

    const grid = screen.getByRole("treegrid", { name: "Tabla del equipo" });
    expect(grid).toHaveAccessibleDescription(/^Muévete con las flechas/);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Rol",
      "Persona / Vacante",
      "Categoría",
      "Depende de",
      "Dedicación",
      "Horas semanales",
      "Inicio – fin",
      "Horas nominales",
      "Horas efectivas",
    ]);
  });

  it("lists the team depth first, siblings in the tree's order, with their tree position", () => {
    renderWithIntl(<Stateful />);

    expect(
      bodyRows().map((candidate) => [
        within(candidate).getAllByRole("gridcell")[0]?.textContent,
        candidate.getAttribute("aria-level"),
        candidate.getAttribute("aria-posinset"),
        candidate.getAttribute("aria-setsize"),
        candidate.getAttribute("aria-expanded"),
      ]),
    ).toEqual([
      ["Project manager", "1", "1", "1", "true"],
      ["Tech lead", "2", "1", "3", "true"],
      ["Backend developer", "3", "1", "1", null],
      ["Frontend Developer", "2", "2", "3", null],
      ["DevOps engineer", "2", "3", "3", null],
    ]);
  });

  it("shows each column's value, and the whole project when the dates follow it", () => {
    renderWithIntl(<Stateful />);

    expect(cells("Tech lead")).toEqual([
      "Tech lead",
      "Senior Developer 1",
      "Senior Developer",
      "Project manager",
      "100\u00a0%",
      "40",
      "Todo el proyecto",
      "1040",
      "897,5",
    ]);
    // Intl spaces the range with thin and no-break spaces.
    expect(cells("Frontend Developer")[6]).toMatch(/^1\sabr\s–\s30\sjun\s2027$/);
    expect(cells("Project manager")[3]).toBe("Nadie");
  });

  it("marks an open role with text and an icon", () => {
    renderWithIntl(<Stateful />);

    const person = within(row("DevOps engineer")).getAllByRole("gridcell")[1]!;
    expect(person).toHaveTextContent("Vacante");
    expect(person.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(cells("DevOps engineer")[5]).toBe("20");
  });

  it("totals the nominal and effective hours in the footer, and shows no money", () => {
    renderWithIntl(<Stateful />);

    const footer = screen.getByRole("rowheader", { name: "Total" }).closest("tr")!;
    // One cell per column, the totals under their own headers.
    expect(
      within(footer)
        .getAllByRole("gridcell")
        .map((cell) => cell.textContent),
    ).toEqual(["", "", "", "", "", "", "5200", "4487,5"]);
    expect(screen.getByRole("treegrid")).not.toHaveTextContent("€");
  });

  it("is one tab stop that starts at the first row and selects what it focuses", async () => {
    renderWithIntl(<Stateful />);

    await userEvent.tab();

    expect(row("Project manager")).toHaveFocus();
    expect(row("Project manager")).toHaveAttribute("aria-selected", "true");
    expect(row("Tech lead")).toHaveAttribute("aria-selected", "false");
    const grid = screen.getByRole("treegrid");
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("moves through rows and cells with the treegrid keys", async () => {
    renderWithIntl(<Stateful />);
    await userEvent.tab();

    await userEvent.keyboard("{ArrowDown}");
    expect(row("Tech lead")).toHaveFocus();
    expect(row("Tech lead")).toHaveAttribute("tabindex", "0");

    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    const leadCells = within(row("Tech lead")).getAllByRole("gridcell");
    expect(leadCells[1]).toHaveFocus();
    expect(leadCells[1]).toHaveAttribute("tabindex", "0");
    expect(row("Tech lead")).toHaveAttribute("tabindex", "-1");

    await userEvent.keyboard("{ArrowDown}");
    expect(within(row("Backend developer")).getAllByRole("gridcell")[1]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(within(row("Backend developer")).getAllByRole("gridcell")[8]).toHaveFocus();
    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(row("Backend developer")).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(row("Tech lead")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(row("Project manager")).toHaveFocus();
    await userEvent.keyboard("{End}{ArrowUp}");
    expect(row("DevOps engineer")).toHaveFocus();
  });

  it("reaches the totals footer with the keys, without selecting it", async () => {
    renderWithIntl(<Stateful />);
    await userEvent.tab();
    const footer = screen.getByRole("rowheader", { name: "Total" }).closest("tr")!;

    await userEvent.keyboard("{End}");
    expect(footer).toHaveFocus();
    expect(footer).toHaveAttribute("aria-level", "1");
    expect(footer).not.toHaveAttribute("aria-selected");
    expect(footer).toHaveAttribute("tabindex", "0");
    expect(row("Project manager")).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(within(footer).getAllByRole("gridcell")[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(within(row("DevOps engineer")).getAllByRole("gridcell")[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowLeft}{ArrowLeft}{ArrowUp}");
    expect(row("DevOps engineer")).toHaveFocus();
  });

  it("goes to the first and last row with Control, keeping the column from a cell", async () => {
    renderWithIntl(<Stateful />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowRight}");
    expect(within(row("Tech lead")).getAllByRole("gridcell")[1]).toHaveFocus();

    await userEvent.keyboard("{Control>}{End}{/Control}");
    const footer = screen.getByRole("rowheader", { name: "Total" }).closest("tr")!;
    expect(within(footer).getAllByRole("gridcell")[0]).toHaveFocus();
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    expect(within(row("Project manager")).getAllByRole("gridcell")[1]).toHaveFocus();
  });

  it("keeps Space on a row from scrolling the page", async () => {
    renderWithIntl(<Stateful />);
    await userEvent.tab();

    expect(fireEvent.keyDown(row("Project manager"), { key: " " })).toBe(false);
    expect(row("Project manager")).toHaveFocus();
  });

  it("marks the selected row with more than its colour", async () => {
    renderWithIntl(<Stateful />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");

    // A bar inside the first cell, a little in from the table's edge; decoration for the eye,
    // since aria-selected already tells assistive technologies.
    const marker = row("Tech lead").querySelector("[data-selected-marker]");
    expect(marker).toBe(within(row("Tech lead")).getAllByRole("gridcell")[0]!.firstElementChild);
    expect(marker).toHaveAttribute("aria-hidden", "true");
    expect(marker).toHaveClass("bg-primary");
    expect(row("Tech lead")).toHaveClass("bg-selected");
    expect(row("Project manager").querySelector("[data-selected-marker]")).toBeNull();
    expect(row("Project manager")).not.toHaveClass("bg-selected");
  });

  it("collapses and expands with the arrows, hiding the reports", async () => {
    renderWithIntl(<Stateful />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}{ArrowLeft}");
    expect(row("Tech lead")).toHaveAttribute("aria-expanded", "false");
    expect(row("Tech lead")).toHaveFocus();
    expect(bodyRows()).toHaveLength(4);

    await userEvent.keyboard("{ArrowRight}");
    expect(row("Tech lead")).toHaveAttribute("aria-expanded", "true");
    expect(bodyRows()).toHaveLength(5);

    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(bodyRows()).toHaveLength(1);
  });

  it("selects a row on click and toggles it with its chevron", async () => {
    renderWithIntl(<Stateful />);

    await userEvent.click(within(row("DevOps engineer")).getAllByRole("gridcell")[2]!);
    expect(row("DevOps engineer")).toHaveAttribute("aria-selected", "true");

    await userEvent.click(row("Tech lead").querySelector("[data-toggle]")!);
    expect(row("Tech lead")).toHaveAttribute("aria-expanded", "false");
    expect(row("Tech lead")).toHaveAttribute("aria-selected", "true");
    expect(bodyRows()).toHaveLength(4);
  });

  it("takes its selection and collapsed rows from its props", async () => {
    const onSelect = vi.fn();
    const onCollapsedChange = vi.fn();
    renderWithIntl(
      <TeamTable
        {...data}
        selected="pm"
        onSelect={onSelect}
        collapsed={new Set(["pm"])}
        onCollapsedChange={onCollapsedChange}
      />,
      { locale: "en" },
    );

    expect(bodyRows()).toHaveLength(1);
    expect(row("Project manager")).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row("Project manager"), { key: "ArrowRight" });
    expect(onCollapsedChange).toHaveBeenCalledWith(new Set());
    expect(screen.getByRole("treegrid", { name: "Team table" })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
