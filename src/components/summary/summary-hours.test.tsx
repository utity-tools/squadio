import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TeamSummary } from "@/lib/summary/summary";
import { renderWithIntl } from "@/test/render";

import { SummaryHours } from "./summary-hours";

// docs/design/canvas-brief.md, "States": without rate access the summary shows team and hours.

const team: TeamSummary = {
  people: 3,
  openRoles: 1,
  nominalHours: 3120,
  effectiveHours: 2379.92,
  span: { start: "2027-04-01", end: "2027-09-29", workingDays: 130 },
};

const plain = (element: Element) => (element.textContent ?? "").replace(/[  ]/g, " ");

describe("SummaryHours", () => {
  it("shows people, open roles, hours and the project span", () => {
    renderWithIntl(<SummaryHours team={team} />);

    const region = within(screen.getByRole("region", { name: "Equipo y horas" }));
    const value = (term: string) => plain(region.getByText(term).nextElementSibling!);
    expect(value("Personas")).toBe("3");
    expect(value("Vacantes")).toBe("1");
    expect(value("Horas nominales")).toBe("3120 h");
    expect(value("Horas efectivas")).toBe("2379,92 h");
    expect(value("Duración del proyecto")).toMatch(
      /^1 abr\s–\s29 sept 2027 · 130 días laborables$/,
    );
  });

  it("says once, neutrally, who sees costs, and never shows a euro sign", () => {
    const { container } = renderWithIntl(<SummaryHours team={team} />);

    expect(
      screen.getByText("Los costes y márgenes los ven las personas con acceso a tarifas."),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("€");
  });

  it("has no span without a team", () => {
    renderWithIntl(
      <SummaryHours
        team={{ ...team, people: 0, openRoles: 0, nominalHours: 0, effectiveHours: 0, span: null }}
      />,
    );

    expect(screen.getByText("Sin fechas: el escenario no tiene equipo")).toBeInTheDocument();
  });
});
