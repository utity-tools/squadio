import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLAN_A } from "@/lib/comparison/comparison.fixtures";
import { buildRevision } from "@/lib/revisions/build-revision";
import { planSource } from "@/lib/revisions/revision.fixtures";
import { revisionView } from "@/lib/revisions/revision-view";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { RevisionTeam } from "./revision-team";

// docs/domain.md, "Sharing a revision": a revision's team, read only, with the names, hours and
// over-allocation it stored. Synthetic data only.

const COMMITMENTS = [
  {
    id: "intranet-senior",
    personId: "senior-1",
    projectId: "intranet",
    projectName: "Intranet",
    allocation: 50,
    startDate: "2027-04-05",
    endDate: "2027-04-09",
  },
];

const planA = () =>
  revisionView({
    open: buildRevision(planSource("Plan A", PLAN_A, { commitments: COMMITMENTS })).open,
    restricted: null,
  });

describe("RevisionTeam", () => {
  it("lists the team it stored in the table, with each person's name", () => {
    renderWithIntl(<RevisionTeam {...planA()} />);

    const table = screen.getByRole("treegrid");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(PLAN_A.length + 1);
    for (const name of ["Person pm-1", "Person senior-1", "Person frontend-1", "Person devops-1"]) {
      expect(within(table).getByText(name)).toBeTruthy();
    }
  });

  it("edits nothing: no row has a menu", () => {
    renderWithIntl(<RevisionTeam {...planA()} />);

    expect(screen.queryByRole("button", { name: /Acciones/ })).toBeNull();
  });

  it("flags the weeks over-allocated the day it was made", () => {
    renderWithIntl(<RevisionTeam {...planA()} />);

    expect(screen.getAllByText(/Intranet/).length).toBeGreaterThan(0);
  });

  it("says when the revision was saved without a team", () => {
    renderWithIntl(<RevisionTeam {...{ ...planA(), team: [], hours: [] }} />);

    expect(screen.getByText("Esta revisión se guardó sin equipo.")).toBeTruthy();
    expect(screen.queryByRole("treegrid")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<RevisionTeam {...planA()} />);
    await expectNoAxeViolations();
  });
});
