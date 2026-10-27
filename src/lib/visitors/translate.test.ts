// @vitest-environment node
// ADR 0011, "The copy": a visitor's first save names the template's ids; the copy has its own.
import { describe, expect, it } from "vitest";

import type { Change, Member } from "@/lib/scenarios/change";

import { copyId } from "./copy-id";
import { translateSave } from "./translate";

const ORG = "0b0e6c1a-5d2f-4c3e-9a8b-7f6e5d4c3b2a";
const t = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NEW_SEAT = "7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const template = new Set([t(200), t(300), t(301), t(10), t(1001)]);
const c = (id: string) => copyId(id, ORG);

const member: Member = {
  id: NEW_SEAT,
  projectRole: "QA",
  categoryId: t(10),
  personId: t(1001),
  reportsTo: t(300),
  weeklyHours: 40,
  allocation: 100,
  startDate: "2027-04-01",
  endDate: "2027-09-29",
};

describe("translateSave", () => {
  it("renames every template id a change names, and the scenario", () => {
    const changes: Change[] = [
      { type: "add", member },
      { type: "move", id: t(301), reportsTo: t(300) },
      { type: "move", id: t(301), reportsTo: null },
      { type: "remove", id: t(300) },
      { type: "edit", id: t(301), set: { personId: t(1001), allocation: 50 } },
      { type: "edit", id: t(301), set: { personId: null } },
      {
        type: "restore",
        member: { ...member, id: t(300), reportsTo: null },
        reports: [t(301), NEW_SEAT],
      },
    ];
    expect(translateSave({ scenarioId: t(200), baseVersion: 1, changes }, template, ORG)).toEqual({
      scenarioId: c(t(200)),
      baseVersion: 1,
      changes: [
        {
          type: "add",
          member: { ...member, categoryId: c(t(10)), personId: c(t(1001)), reportsTo: c(t(300)) },
        },
        { type: "move", id: c(t(301)), reportsTo: c(t(300)) },
        { type: "move", id: c(t(301)), reportsTo: null },
        { type: "remove", id: c(t(300)) },
        { type: "edit", id: c(t(301)), set: { personId: c(t(1001)), allocation: 50 } },
        { type: "edit", id: c(t(301)), set: { personId: null } },
        {
          type: "restore",
          member: {
            ...member,
            id: c(t(300)),
            categoryId: c(t(10)),
            personId: c(t(1001)),
            reportsTo: null,
          },
          reports: [c(t(301)), NEW_SEAT],
        },
      ],
    });
  });

  it("keeps the ids the client made for new assignments", () => {
    const result = translateSave(
      {
        scenarioId: t(200),
        baseVersion: 3,
        changes: [{ type: "move", id: NEW_SEAT, reportsTo: null }],
      },
      template,
      ORG,
    );
    expect(result.changes).toEqual([{ type: "move", id: NEW_SEAT, reportsTo: null }]);
  });

  it("finds template ids whatever their case", () => {
    const upper = t(200).toUpperCase();
    expect(
      translateSave({ scenarioId: upper, baseVersion: 1, changes: [] }, template, ORG).scenarioId,
    ).toBe(c(t(200)));
  });
});
