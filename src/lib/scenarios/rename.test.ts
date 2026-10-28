import { describe, expect, it } from "vitest";

import {
  PM,
  SENIOR,
  developer,
  lead,
  manager,
  personId,
  roster,
  seat,
  seatId,
  team,
} from "./change.fixtures";
import { createHistory, record } from "./history";
import { renameBasis, renameHistory, renamer } from "./rename";
import type { ScenarioBasis } from "./scenario-view";

// ADR 0011, "The first save re-renders the page": the copy holds the template's rows under new
// ids, and the page carries its history across by renaming every id it holds.

const copyOf = (id: string) => id.replace("-8000-", "-9000-");
const renamed = Object.fromEntries(
  [manager.id, lead.id, developer.id, SENIOR, PM, personId(1), personId(3)].map((id) => [
    id,
    copyOf(id),
  ]),
);
const rename = renamer(renamed);

describe("renamer", () => {
  it("renames the ids it knows, in any case, and leaves the others alone", () => {
    expect(rename(manager.id)).toBe(copyOf(manager.id));
    expect(rename(manager.id.toUpperCase())).toBe(copyOf(manager.id));
    expect(rename(seatId(42))).toBe(seatId(42));
  });
});

describe("renameHistory", () => {
  it("renames the team, every entry and what is left to save", () => {
    const added = seat(8, { reportsTo: manager.id });
    let history = createHistory([manager, lead, developer]);
    for (const change of [
      { type: "remove" as const, id: lead.id },
      { type: "add" as const, member: added },
    ]) {
      const result = record(history, roster, change);
      if (!result.ok) throw new Error(result.reason);
      history = result.history;
    }

    const next = renameHistory(history, rename);
    expect(next.team.map((member) => member.id)).toEqual([
      copyOf(manager.id),
      copyOf(developer.id),
      seatId(8),
    ]);
    expect(next.team.find((member) => member.id === copyOf(developer.id))?.reportsTo).toBe(
      copyOf(manager.id),
    );
    expect(next.entries[0]?.change).toEqual({ type: "remove", id: copyOf(lead.id) });
    expect(next.entries[0]?.inverse[0]).toMatchObject({
      type: "restore",
      member: { id: copyOf(lead.id), personId: copyOf(personId(1)), categoryId: copyOf(SENIOR) },
    });
    // The client's own id stays; the seat it reports to is renamed.
    expect(next.pending[1]).toMatchObject({
      type: "add",
      member: { id: seatId(8), reportsTo: copyOf(manager.id), categoryId: copyOf(SENIOR) },
    });
    expect(next.cursor).toBe(history.cursor);
  });

  it("changes nothing when no id is renamed", () => {
    const history = createHistory(team);
    expect(renameHistory(history, renamer({}))).toEqual(history);
  });
});

describe("renameBasis", () => {
  it("renames the categories, people, rates and small categories", () => {
    const basis: ScenarioBasis = {
      project: { name: "Project 1", client: "Client 1", pricingModel: "fixed" },
      scenario: { name: "Plan A", chosen: false },
      categories: [{ id: SENIOR, name: "Senior Developer" }],
      people: [
        { id: personId(1), name: "Person 1", categoryId: SENIOR, weeklyHours: 40, active: true },
      ],
      defaultWeeklyHours: 40,
      engine: {
        rateAccess: true,
        input: {
          scenario: { pricing: { model: "fixed", priceCents: 1 }, assignments: [], extraCosts: [] },
          rates: [
            { categoryId: SENIOR, sellRateCents: 1, cost: { kind: "manual", costPerHourCents: 1 } },
          ],
          costSettings: {
            overheadBasisPoints: 0,
            bufferBasisPoints: 0,
            netAnnualHours: 1_600,
            calendarWorkingHours: 2_000,
          },
          targetMargin: 0,
        },
        smallCategories: [{ categoryId: SENIOR, activePeople: 1 }],
        extraCosts: [],
      },
    };

    const next = renameBasis(basis, rename);
    expect(next.categories).toEqual([{ id: copyOf(SENIOR), name: "Senior Developer" }]);
    expect(next.people[0]).toMatchObject({ id: copyOf(personId(1)), categoryId: copyOf(SENIOR) });
    if (!next.engine.rateAccess) throw new Error("expected rate access");
    expect(next.engine.input.rates[0]?.categoryId).toBe(copyOf(SENIOR));
    expect(next.engine.smallCategories).toEqual([{ categoryId: copyOf(SENIOR), activePeople: 1 }]);
    expect(next.project).toBe(basis.project);
  });
});
