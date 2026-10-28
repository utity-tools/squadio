import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { ScenarioShell, ScenarioShellSkeleton } from "./scenario-shell";

describe("ScenarioShell", () => {
  it("lays out a header, the team and the summary, in that order", () => {
    renderWithIntl(
      <ScenarioShell header={<h1>Plan A</h1>} team={<p>tree</p>} summary={<p>ledger</p>} />,
    );

    const banner = screen.getByRole("banner");
    const team = screen.getByRole("main", { name: "Equipo" });
    const summary = screen.getByRole("complementary", { name: "Resumen" });
    expect(within(banner).getByRole("heading", { level: 1, name: "Plan A" })).toBeInTheDocument();
    expect(within(team).getByText("tree")).toBeInTheDocument();
    expect(within(summary).getByText("ledger")).toBeInTheDocument();
    // Header, then team, then summary: the tab order of the canvas brief.
    expect(banner.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(team.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lets the keyboard reach the summary, which scrolls in its own rail", () => {
    renderWithIntl(<ScenarioShell header={null} team={null} summary={<p>ledger</p>} />);

    expect(screen.getByRole("complementary", { name: "Resumen" })).toHaveAttribute("tabindex", "0");
  });

  it("puts the actions before the theme switch, at the header's end", () => {
    renderWithIntl(
      <ScenarioShell
        header={null}
        actions={<button type="button">Deshacer</button>}
        team={null}
        summary={null}
      />,
    );

    const banner = within(screen.getByRole("banner"));
    const undo = banner.getByRole("button", { name: "Deshacer" });
    const theme = banner.getByRole("radiogroup", { name: "Tema" });
    expect(undo.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the theme switch in the header", () => {
    renderWithIntl(<ScenarioShell header={null} team={null} summary={null} />);

    expect(
      within(screen.getByRole("banner")).getByRole("radiogroup", { name: "Tema" }),
    ).toBeInTheDocument();
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

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Resumen" })).toBeInTheDocument();
  });
});
