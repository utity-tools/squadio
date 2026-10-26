import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { guideHours, guideSpan, guideTeam } from "@/test/guide-team";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";

import { type ScenarioTeamProps, ScenarioTeam } from "./scenario-team";

stubReactFlowLayout();

const team = guideTeam;

const guide: ScenarioTeamProps = { team, hours: guideHours, span: guideSpan };

const node = (name: RegExp) => screen.getByRole("button", { name });

describe("ScenarioTeam", () => {
  it("draws one card per assignment in a labelled canvas", () => {
    renderWithIntl(<ScenarioTeam {...guide} />);

    expect(screen.getByRole("application", { name: "Árbol del equipo" })).toBeInTheDocument();
    for (const name of [/^Project manager/, /^Tech lead/, /^Frontend Developer/, /^DevOps/]) {
      expect(node(name)).toBeInTheDocument();
    }
  });

  it("keeps the selected node", () => {
    renderWithIntl(<ScenarioTeam {...guide} />);

    fireEvent.click(node(/^Tech lead/));

    expect(node(/^Tech lead/)).toHaveAttribute("aria-current", "true");
  });

  it("shows an empty state without assignments", () => {
    renderWithIntl(<ScenarioTeam team={[]} hours={[]} span={null} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Este escenario aún no tiene equipo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
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
