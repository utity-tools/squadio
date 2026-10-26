import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { guideHours, guideSpan, guideTeam } from "@/test/guide-team";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";

import { type ScenarioTeamProps, ScenarioTeam } from "./scenario-team";

vi.mock("next/navigation", () => import("@/test/navigation"));

stubReactFlowLayout();

beforeEach(() => {
  stubScreen({ wide: true });
  stubHistory("/scenarios/guide");
});

const team = guideTeam;

const guide: ScenarioTeamProps = { team, hours: guideHours, span: guideSpan };

const node = (name: RegExp) => screen.getByRole("button", { name });

describe("ScenarioTeam", () => {
  it("draws the team in the view switch's view, one card per assignment", () => {
    renderWithIntl(<ScenarioTeam {...guide} />);

    expect(screen.getByRole("radiogroup", { name: "Vista" })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: "Árbol del equipo" })).toBeInTheDocument();
    for (const name of [/^Project manager/, /^Tech lead/, /^Frontend Developer/, /^DevOps/]) {
      expect(node(name)).toBeInTheDocument();
    }
  });

  it("lists the same team in the table view", () => {
    stubHistory("/scenarios/guide?view=table");
    renderWithIntl(<ScenarioTeam {...guide} />);

    expect(screen.getByRole("treegrid", { name: "Tabla del equipo" })).toBeInTheDocument();
    // Four assignments, plus the header and the totals.
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("shows an empty state without assignments", () => {
    renderWithIntl(<ScenarioTeam team={[]} hours={[]} span={null} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Este escenario aún no tiene equipo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("names the assignments in a loop instead of drawing the tree", () => {
    const loop = team.map((member) =>
      member.id === "pm" ? { ...member, reportsTo: "lead" } : member,
    );
    renderWithIntl(<ScenarioTeam {...guide} team={loop} />, { locale: "en" });

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByRole("heading", { level: 2, name: "We can't draw this team" }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "These assignments report to each other in a loop: " +
        "Project manager (Project Manager 1) and Tech lead (Senior Developer 1).",
    );
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("names an assignment that reports to someone outside the scenario", () => {
    const stray = team.map((member) =>
      member.id === "ops" ? { ...member, reportsTo: "gone" } : member,
    );
    renderWithIntl(<ScenarioTeam {...guide} team={stray} />, { locale: "en" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "DevOps engineer (Open role) reports to an assignment that is not in this scenario.",
    );
  });

  it("names a repeated assignment", () => {
    renderWithIntl(<ScenarioTeam {...guide} team={[...team, team[1]!]} />, { locale: "en" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The assignment Tech lead (Senior Developer 1) appears twice.",
    );
  });
});
