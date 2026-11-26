import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { SCENARIO_PANEL_ID, ScenarioShell, ScenarioShellSkeleton } from "./scenario-shell";

describe("ScenarioShell", () => {
  it("lays out a header, the team and the summary, in that order", () => {
    renderWithIntl(
      <ScenarioShell header={<h1>Plan A</h1>} team={<p>tree</p>} summary={<p>ledger</p>} />,
    );

    const header = screen.getByRole("region", { name: "Datos del escenario" });
    expect(within(header).getByRole("heading", { level: 1, name: "Plan A" })).toBeInTheDocument();
    const team = screen.getByRole("main", { name: "Equipo" });
    const summary = screen.getByRole("complementary", { name: "Resumen" });
    expect(within(team).getByText("tree")).toBeInTheDocument();
    expect(within(summary).getByText("ledger")).toBeInTheDocument();
    // Header, then team, then summary: the tab order of the canvas brief.
    expect(header.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(team.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the bench before the team, in a region of its own", () => {
    renderWithIntl(
      <ScenarioShell header={null} bench={<p>people</p>} team={<p>tree</p>} summary={null} />,
    );

    const bench = screen.getByRole("complementary", { name: "Banquillo" });
    const team = screen.getByRole("main", { name: "Equipo" });
    expect(within(bench).getByText("people")).toBeInTheDocument();
    expect(bench).toHaveAttribute("tabindex", "0");
    expect(bench.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lets the keyboard reach the summary, which scrolls in its own rail", () => {
    renderWithIntl(<ScenarioShell header={null} team={null} summary={<p>ledger</p>} />);

    expect(screen.getByRole("complementary", { name: "Resumen" })).toHaveAttribute("tabindex", "0");
  });

  it("leaves the rail out of the tab order when its content holds controls, as the card's tabs", () => {
    renderWithIntl(
      <ScenarioShell header={null} team={null} summary={<p>card</p>} summaryFocusable={false} />,
    );

    const rail = screen.getByRole("complementary", { name: "Resumen" });
    expect(rail).not.toHaveAttribute("tabindex");
    // The panel's toggle in the bar names it.
    expect(rail).toHaveAttribute("id", SCENARIO_PANEL_ID);
  });

  it("hides the rail, and gives its room to the team, when the panel is hidden (ADR 0017)", () => {
    renderWithIntl(<ScenarioShell header={null} team={null} summary={<p>ledger</p>} />);

    const rail = screen.getByRole("complementary", { name: "Resumen" });
    expect(rail).toHaveClass("[:root[data-rail=hidden]_&]:md:hidden");
    expect(rail.parentElement).toHaveClass(
      "[:root[data-rail=hidden]_&]:md:grid-cols-[0_minmax(0,1fr)_0]",
    );
  });

  it("puts the actions at the header's end and leaves the theme to the app's top bar", () => {
    renderWithIntl(
      <ScenarioShell
        header={<h1>Plan A</h1>}
        actions={<button type="button">Deshacer</button>}
        team={null}
        summary={null}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Plan A" });
    const undo = screen.getByRole("button", { name: "Deshacer" });
    expect(heading.compareDocumentPosition(undo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The app's top bar is the page's only banner, and it holds the theme switch.
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Tema" })).not.toBeInTheDocument();
  });

  it("names its regions in the page's locale", () => {
    renderWithIntl(<ScenarioShell header={null} team={null} summary={null} />, { locale: "en" });

    expect(screen.getByRole("main", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Summary" })).toBeInTheDocument();
  });
});

describe("ScenarioShellSkeleton", () => {
  it("announces that the scenario is loading, once", () => {
    renderWithIntl(<ScenarioShellSkeleton />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el escenario…");
  });

  it("keeps the shape of the page so nothing jumps when it loads", () => {
    renderWithIntl(<ScenarioShellSkeleton />);

    expect(screen.getByRole("status")).toHaveTextContent(/./);
    expect(screen.getByRole("complementary", { name: "Banquillo" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Resumen" })).toBeInTheDocument();
  });
});
