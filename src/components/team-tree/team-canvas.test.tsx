import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { layoutTeam } from "@/lib/layout/compact-layout";
import { assignmentCards } from "@/lib/team-tree/cards";
import { guideHours, guideSpan, guideTeam } from "@/test/guide-team";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";

import { type TeamCanvasProps, TeamCanvas } from "./team-canvas";

stubReactFlowLayout();

beforeAll(() => {
  // Reduced motion: zooming is instant.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
});

const layout = layoutTeam(guideTeam);
if (!layout.ok) throw new Error("expected a layout");

const data = {
  team: guideTeam.map(({ id, reportsTo }) => ({ id, reportsTo })),
  nodes: layout.nodes,
  cards: assignmentCards(guideTeam, guideHours, guideSpan),
};

/** The canvas with its selection held here, as the scenario page holds it. */
function Stateful(props: Partial<TeamCanvasProps>) {
  const [selected, setSelected] = useState<string | null>(null);
  return <TeamCanvas {...data} selected={selected} onSelect={setSelected} {...props} />;
}

const node = (name: RegExp) => screen.getByRole("button", { name });

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * A card's name: its lines in order, separated by commas however the browser spaces them. Spanish
 * puts a no-break space before "%".
 */
const lines = (...parts: string[]) =>
  new RegExp(`^${parts.map((part) => escape(part).replaceAll(" ", "\\s")).join("\\s*,\\s*")}$`);

describe("TeamCanvas", () => {
  it("draws one card per assignment in a labelled canvas", () => {
    renderWithIntl(<Stateful />);

    expect(screen.getByRole("application", { name: "Árbol del equipo" })).toBeInTheDocument();
    for (const name of [/^Project manager/, /^Tech lead/, /^Frontend Developer/, /^DevOps/]) {
      expect(node(name)).toBeInTheDocument();
    }
  });

  it("shows role, person, category, allocation, weekly and effective hours, and no money", () => {
    renderWithIntl(<Stateful />);

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
    renderWithIntl(<Stateful />);

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
    renderWithIntl(<Stateful />);

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
    renderWithIntl(<Stateful />);

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
    renderWithIntl(<Stateful />);
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
    renderWithIntl(<Stateful />);

    // A plain click: user-event's mousedown would start d3-zoom's pan, which jsdom cannot run.
    fireEvent.click(node(/^Tech lead/));

    expect(node(/^Tech lead/)).toHaveAttribute("aria-current", "true");
    expect(node(/^Project manager/)).toHaveAttribute("data-on-path");
  });

  it("takes its selection from its props and reports what is clicked or focused", async () => {
    const onSelect = vi.fn();
    renderWithIntl(<TeamCanvas {...data} selected="ops" onSelect={onSelect} />);

    // The selected node is the tab stop, highlighted with its path.
    expect(node(/^DevOps/)).toHaveAttribute("aria-current", "true");
    expect(node(/^DevOps/)).toHaveAttribute("tabindex", "0");
    expect(node(/^Project manager/)).toHaveAttribute("tabindex", "-1");
    expect(node(/^Project manager/)).toHaveAttribute("data-on-path");

    fireEvent.click(node(/^Tech lead/));
    expect(onSelect).toHaveBeenLastCalledWith("lead");
    // Controlled: nothing changes until the caller passes the new selection.
    expect(node(/^Tech lead/)).not.toHaveAttribute("aria-current");

    await userEvent.tab();
    expect(node(/^DevOps/)).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith("ops");
  });

  it("has named zoom and fit controls", () => {
    renderWithIntl(<Stateful />, { locale: "en" });

    const controls = screen.getByRole("group", { name: "Canvas controls" });
    for (const name of ["Zoom in", "Zoom out", "Fit the team in view"]) {
      expect(within(controls).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("zooms with the buttons and the keys", async () => {
    const { container } = renderWithIntl(<Stateful />, { locale: "en" });
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
});
