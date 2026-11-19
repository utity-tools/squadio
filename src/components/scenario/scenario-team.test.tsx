import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { teamOverAllocation } from "@/lib/load/over-allocation";
import { guideHours, guideSpan, guideTeam } from "@/test/guide-team";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { expectNoAxeViolations } from "@/test/axe";
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

  it("marks the assignments whose category has no rate", () => {
    renderWithIntl(<ScenarioTeam {...guide} withoutRate={new Set(["c-ops"])} />);
    expect(node(/^DevOps/)).toHaveTextContent("Falta el coste");
    expect(node(/^Tech lead/)).not.toHaveTextContent("Falta el coste");
  });

  it("flags what falls outside the planned period, and what the team leaves uncovered", () => {
    // The demo's First draft: a team until 29 September in a period until 31 December.
    const plannedPeriod = { start: "2027-03-29", end: "2027-12-31" };
    renderWithIntl(<ScenarioTeam {...guide} plannedPeriod={plannedPeriod} />);

    expect(
      screen.getByText(
        "El equipo empieza 3 días después y acaba 93 días antes del periodo previsto",
      ),
    ).toBeVisible();
    // Never refused: every assignment lies within the period, so none is flagged.
    expect(screen.queryByText("Fuera del periodo")).not.toBeInTheDocument();
  });

  it("flags the assignments outside the planned period", () => {
    const plannedPeriod = { start: "2027-05-01", end: "2027-09-29" };
    renderWithIntl(<ScenarioTeam {...guide} plannedPeriod={plannedPeriod} />);

    expect(node(/^Tech lead/)).toHaveTextContent("Fuera del periodo");
    expect(screen.queryByText(/El equipo/)).not.toBeInTheDocument();
  });

  describe("over-allocation (rule c)", () => {
    // Another project's chosen scenario adds the tech lead at 50% for five weeks: four of April and
    // one of June.
    const commitment = (id: string, startDate: string, endDate: string) => ({
      id,
      personId: "p-senior",
      projectId: "project-2",
      projectName: "Project 2",
      allocation: 50,
      startDate,
      endDate,
    });
    const overAllocated = teamOverAllocation({
      projectId: "guide",
      plannedPeriod: null,
      team: team.map(({ id, person, allocation, startDate, endDate }) => ({
        id,
        personId: person?.id ?? null,
        allocation,
        startDate,
        endDate,
      })),
      commitments: [
        commitment("april", "2027-04-05", "2027-04-30"),
        commitment("june", "2027-06-07", "2027-06-11"),
      ],
    });
    const detail =
      "Por encima del 100 % en 5 semanas: 5 abr 2027: 150 % con Project 2, 12 abr 2027: 150 % " +
      "con Project 2, 19 abr 2027: 150 % con Project 2, 26 abr 2027: 150 % con Project 2 y " +
      "1 semana más";

    it("flags the person's assignment on the tree, with the weeks and the projects", () => {
      renderWithIntl(<ScenarioTeam {...guide} overAllocated={overAllocated} />);

      expect(node(/^Tech lead/)).toHaveTextContent("Sobreasignación");
      expect(node(/^Tech lead/)).toHaveTextContent(detail);
      expect(node(/^Project manager/)).not.toHaveTextContent("Sobreasignación");
    });

    it("flags it in the table, under the dates", () => {
      stubHistory("/scenarios/guide?view=table");
      renderWithIntl(<ScenarioTeam {...guide} overAllocated={overAllocated} />);

      const row = screen.getByRole("row", { name: /Tech lead/ });
      expect(row).toHaveTextContent(detail);
      expect(screen.getByRole("row", { name: /^Project manager/ })).not.toHaveTextContent(
        "Por encima del 100 %",
      );
    });
  });

  it("marks nothing without the categories missing a rate", () => {
    stubHistory("/scenarios/guide?view=table");
    renderWithIntl(<ScenarioTeam {...guide} />);

    expect(screen.queryByText("Falta el coste")).not.toBeInTheDocument();
  });

  it("shows an empty state without assignments", () => {
    renderWithIntl(<ScenarioTeam team={[]} hours={[]} span={null} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Este escenario aún no tiene equipo" }),
    ).toBeInTheDocument();
    // Either view may show the team once it has one: the text names neither.
    expect(screen.getByText("Sus asignaciones aparecerán aquí.")).toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("draws the empty state as the redesign's card, its picture hidden from screen readers", async () => {
    renderWithIntl(<ScenarioTeam team={[]} hours={[]} span={null} />);

    const heading = screen.getByRole("heading", { name: "Este escenario aún no tiene equipo" });
    const card = heading.closest("[data-slot=empty-team]");
    expect(card).toHaveClass("rounded-[14px]", "border", "bg-background");
    expect(card?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await expectNoAxeViolations();
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
