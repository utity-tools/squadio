import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TeamAssignment } from "@/db/load-scenario";
import { renderWithIntl } from "@/test/render";

import { type TeamTreeProps, TeamTree } from "./team-tree";

const span = { start: "2027-04-01", end: "2027-09-29", workingDays: 130 };

const seat = { weeklyHours: 40, startDate: span.start, endDate: span.end };

/** The guide case: a project manager with three reports, the DevOps seat still open. */
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

const guide: TeamTreeProps = { team, hours, span };

const offsets = ["offsetWidth", "offsetHeight"] as const;
const originalOffsets = offsets.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);

beforeAll(() => {
  // React Flow measures its container and nodes; jsdom has no layout.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    class {
      m22 = 1;
    },
  );
  // Reduced motion: zooming is instant.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  // Nodes stay hidden until React Flow has measured them.
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: () => 240 },
    offsetHeight: { configurable: true, get: () => 120 },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  offsets.forEach((name, index) => {
    const original = originalOffsets[index];
    if (original) Object.defineProperty(HTMLElement.prototype, name, original);
  });
});

const node = (name: RegExp) => screen.getByRole("button", { name });

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * A card's name: its lines in order, separated by commas however the browser spaces them. Spanish
 * puts a no-break space before "%".
 */
const lines = (...parts: string[]) =>
  new RegExp(`^${parts.map((part) => escape(part).replaceAll(" ", "\\s")).join("\\s*,\\s*")}$`);

describe("TeamTree", () => {
  it("draws one card per assignment in a labelled canvas", () => {
    renderWithIntl(<TeamTree {...guide} />);

    expect(screen.getByRole("application", { name: "Árbol del equipo" })).toBeInTheDocument();
    for (const name of [/^Project manager/, /^Tech lead/, /^Frontend Developer/, /^DevOps/]) {
      expect(node(name)).toBeInTheDocument();
    }
  });

  it("shows role, person, category, allocation, weekly and effective hours, and no money", () => {
    renderWithIntl(<TeamTree {...guide} />);

    const lead = node(/^Tech lead/);
    expect(lead).toHaveAccessibleName(
      lines(
        "Tech lead",
        "Senior Developer 1",
        "Senior Developer",
        "100 %",
        "40 h/sem",
        "897,5 h efectivas",
      ),
    );
    expect(lead).not.toHaveTextContent("€");
  });

  it("names the category when the role is empty and gives dates that differ from the span", () => {
    renderWithIntl(<TeamTree {...guide} />);

    expect(node(/^Frontend Developer\s*,\s*Frontend Developer 1/)).toHaveAccessibleName(
      lines(
        "Frontend Developer",
        "Frontend Developer 1",
        "Frontend Developer",
        "100 %",
        "40 h/sem",
        "1 abr – 30 jun 2027",
        "897,5 h efectivas",
      ),
    );
  });

  it("marks an open role", () => {
    renderWithIntl(<TeamTree {...guide} />);

    const ops = node(/^DevOps/);
    expect(ops).toHaveAccessibleName(
      lines(
        "DevOps engineer",
        "Vacante",
        "DevOps Engineer",
        "50 %",
        "20 h/sem",
        "897,5 h efectivas",
      ),
    );
    expect(ops).toHaveAttribute("data-open-role");
  });

  it("is one tab stop that starts at the root", async () => {
    renderWithIntl(<TeamTree {...guide} />);

    await userEvent.tab();

    expect(node(/^Project manager/)).toHaveFocus();
    const tabStops = screen
      .getAllByRole("button")
      .filter((button) => button.dataset.assignment !== undefined)
      .map((button) => [button.dataset.assignment, button.tabIndex]);
    expect(tabStops).toEqual([
      ["pm", 0],
      ["lead", -1],
      ["front", -1],
      ["ops", -1],
    ]);
  });

  it("moves with the arrows and highlights the path to the root", async () => {
    renderWithIntl(<TeamTree {...guide} />);
    await userEvent.tab();

    await userEvent.keyboard("{ArrowDown}");
    expect(node(/^Tech lead/)).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(node(/^DevOps/)).toHaveFocus();
    expect(node(/^DevOps/)).toHaveAttribute("aria-current", "true");
    expect(node(/^DevOps/)).toHaveAttribute("data-on-path");
    expect(node(/^Project manager/)).toHaveAttribute("data-on-path");
    expect(node(/^Tech lead/)).not.toHaveAttribute("data-on-path");
    expect(node(/^DevOps/)).toHaveAttribute("tabindex", "0");

    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    expect(node(/^Project manager/)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{Home}");
    expect(node(/^Project manager/)).toHaveFocus();
  });

  it("selects a node on click", () => {
    renderWithIntl(<TeamTree {...guide} />);

    // A plain click: user-event's mousedown would start d3-zoom's pan, which jsdom cannot run.
    fireEvent.click(node(/^Tech lead/));

    expect(node(/^Tech lead/)).toHaveAttribute("aria-current", "true");
    expect(node(/^Project manager/)).toHaveAttribute("data-on-path");
  });

  it("has named zoom and fit controls", () => {
    renderWithIntl(<TeamTree {...guide} />, { locale: "en" });

    const controls = screen.getByRole("group", { name: "Canvas controls" });
    for (const name of ["Zoom in", "Zoom out", "Fit the team in view"]) {
      expect(within(controls).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("zooms with the buttons and the keys", async () => {
    const { container } = renderWithIntl(<TeamTree {...guide} />, { locale: "en" });
    const viewport = container.querySelector<HTMLElement>(".react-flow__viewport")!;
    const scale = () => viewport.style.transform;
    const fitted = scale();

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await vi.waitFor(() => expect(scale()).not.toBe(fitted));
    const zoomedIn = scale();
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await vi.waitFor(() => expect(scale()).not.toBe(zoomedIn));
    const zoomedOut = scale();

    await userEvent.tab();
    await userEvent.keyboard("+");
    await vi.waitFor(() => expect(scale()).not.toBe(zoomedOut));
  });

  it("shows an empty state without assignments", () => {
    renderWithIntl(<TeamTree team={[]} hours={[]} span={null} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Este escenario aún no tiene equipo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("names the assignments in a loop instead of drawing the tree", () => {
    const loop = team.map((member) =>
      member.id === "pm" ? { ...member, reportsTo: "lead" } : member,
    );
    renderWithIntl(<TeamTree {...guide} team={loop} />, { locale: "en" });

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByRole("heading", { level: 2, name: "We can't draw this team" }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "These assignments report to each other in a loop: " +
        "Project manager (Project Manager 1) and Tech lead (Senior Developer 1).",
    );
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("names an assignment that reports to someone outside the scenario", () => {
    const stray = team.map((member) =>
      member.id === "ops" ? { ...member, reportsTo: "gone" } : member,
    );
    renderWithIntl(<TeamTree {...guide} team={stray} />, { locale: "en" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "DevOps engineer (Open role) reports to an assignment that is not in this scenario.",
    );
  });

  it("names a repeated assignment", () => {
    renderWithIntl(<TeamTree {...guide} team={[...team, team[1]!]} />, { locale: "en" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The assignment Tech lead (Senior Developer 1) appears twice.",
    );
  });
});
