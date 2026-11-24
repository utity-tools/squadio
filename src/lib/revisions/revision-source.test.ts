// @vitest-environment node
import { describe, expect, it } from "vitest";

import { teamOverAllocation } from "@/lib/load/over-allocation";
import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { team } from "@/lib/scenarios/change.fixtures";
import { engineInputFor, scenarioView } from "@/lib/scenarios/scenario-view";

import { buildRevision } from "./build-revision";
import { revisionSourceOf } from "./revision-source";

// docs/domain.md, "When one is made": a revision is of the scenario as saved, with the current
// values. Synthetic data only.

describe("revisionSourceOf", () => {
  it("takes the scenario's name, its named team and the engine's inputs for it", () => {
    const source = revisionSourceOf(ratesBasis, team);

    expect(source.scenarioName).toBe("Plan A");
    expect(source.team).toEqual(scenarioView(ratesBasis, team).team);
    expect(source.input).toEqual(engineInputFor(ratesBasis, team));
  });

  it("takes the over-allocation the page shows for the team (rule c)", () => {
    const [first] = team;
    if (!first?.personId) throw new Error("expected the fixture's first member to be a person");
    const basis = {
      ...ratesBasis,
      commitments: [
        {
          id: "other-assignment",
          personId: first.personId,
          projectId: "project-2",
          projectName: "Project 2",
          allocation: 100,
          startDate: first.startDate,
          endDate: first.endDate,
        },
      ],
    };

    const source = revisionSourceOf(basis, team);

    expect(source.overAllocation.size).toBeGreaterThan(0);
    expect(source.overAllocation).toEqual(
      teamOverAllocation({
        projectId: basis.project.id,
        plannedPeriod: basis.project.plannedPeriod,
        team,
        commitments: basis.commitments,
      }),
    );
  });

  it("gives a source buildRevision accepts", () => {
    expect(() => buildRevision(revisionSourceOf(ratesBasis, team))).not.toThrow();
  });

  it("refuses a basis without rate access: the restricted part is part of a revision", () => {
    expect(() => revisionSourceOf(hoursBasis, team)).toThrow(/rate access/);
  });

  it("refuses a chosen scenario's revision: a revision takes the saved team and current values", () => {
    const chosen = {
      ...ratesBasis,
      chosenRevision: {
        id: "r",
        number: 1,
        view: { open: buildRevision(revisionSourceOf(ratesBasis, team)).open, restricted: null },
      },
    };

    expect(() => revisionSourceOf(chosen, team)).toThrow(/current values/);
  });
});
