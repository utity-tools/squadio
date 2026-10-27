// @vitest-environment node
// docs/domain.md, "Changes": the shape of each change, before it meets a team.
import { describe, expect, it } from "vitest";

import { type Member, parseChange } from "./change";

const member: Member = {
  id: "00000000-0000-4000-8000-000000000001",
  projectRole: "Tech lead",
  categoryId: "00000000-0000-4000-8000-0000000000c1",
  personId: "00000000-0000-4000-8000-0000000000e1",
  reportsTo: null,
  weeklyHours: 40,
  allocation: 100,
  startDate: "2027-04-01",
  endDate: "2027-09-29",
};

const add = (overrides: Partial<Member>) => ({ type: "add", member: { ...member, ...overrides } });
const edit = (set: Record<string, unknown>) => ({ type: "edit", id: member.id, set });

const issuePaths = (input: unknown) => {
  const result = parseChange(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("parseChange", () => {
  it("accepts each kind of change", () => {
    for (const change of [
      { type: "add", member },
      { type: "add", member: { ...member, personId: null, reportsTo: member.categoryId } },
      { type: "move", id: member.id, reportsTo: member.categoryId },
      { type: "move", id: member.id, reportsTo: null },
      { type: "remove", id: member.id },
      edit({ allocation: 50, personId: null }),
      edit({ projectRole: "Architect", weeklyHours: 37.5, startDate: "2027-05-03" }),
      { type: "restore", member, reports: [member.categoryId] },
    ]) {
      expect(parseChange(change)).toEqual({ success: true, data: change });
    }
  });

  it("refuses an allocation that is not an integer from 0 to 100", () => {
    expect(issuePaths(add({ allocation: 0 }))).toEqual([]);
    expect(issuePaths(add({ allocation: 101 }))).toEqual(["member.allocation"]);
    expect(issuePaths(add({ allocation: -1 }))).toEqual(["member.allocation"]);
    expect(issuePaths(edit({ allocation: 12.5 }))).toEqual(["set.allocation"]);
  });

  it("refuses weekly hours that are not positive hundredths up to 168", () => {
    expect(issuePaths(add({ weeklyHours: 37.33 }))).toEqual([]);
    expect(issuePaths(add({ weeklyHours: 168 }))).toEqual([]);
    expect(issuePaths(add({ weeklyHours: 0 }))).toEqual(["member.weeklyHours"]);
    expect(issuePaths(add({ weeklyHours: 168.01 }))).toEqual(["member.weeklyHours"]);
    expect(issuePaths(edit({ weeklyHours: 37.333 }))).toEqual(["set.weeklyHours"]);
    expect(issuePaths(edit({ weeklyHours: Number.NaN }))).toEqual(["set.weeklyHours"]);
  });

  it("refuses an empty, blank or overlong project role", () => {
    expect(issuePaths(add({ projectRole: "x".repeat(100) }))).toEqual([]);
    expect(issuePaths(add({ projectRole: "" }))).toEqual(["member.projectRole"]);
    expect(issuePaths(add({ projectRole: "   " }))).toEqual(["member.projectRole"]);
    expect(issuePaths(edit({ projectRole: "x".repeat(101) }))).toEqual(["set.projectRole"]);
  });

  it("refuses a date that is not real or outside the calendar's years", () => {
    expect(issuePaths(add({ startDate: "2027-02-30" }))).toEqual(["member.startDate"]);
    expect(issuePaths(add({ endDate: "2031-01-31" }))).toEqual(["member.endDate"]);
    expect(issuePaths(edit({ startDate: "1 April 2027" }))).toEqual(["set.startDate"]);
  });

  it("refuses ids that are not UUIDs", () => {
    expect(issuePaths({ type: "remove", id: "seat-1" })).toEqual(["id"]);
    expect(issuePaths(add({ reportsTo: "" }))).toEqual(["member.reportsTo"]);
    expect(issuePaths(edit({ personId: "someone" }))).toEqual(["set.personId"]);
  });

  it("refuses an edit that sets nothing", () => {
    expect(issuePaths(edit({}))).toEqual(["set"]);
  });

  it("refuses an edit that names a field without a value", () => {
    expect(issuePaths(edit({ startDate: undefined }))).toEqual(["set"]);
    expect(issuePaths(edit({ allocation: 50, projectRole: undefined }))).toEqual(["set"]);
  });

  it("refuses unknown kinds and unknown fields", () => {
    expect(issuePaths({ type: "rename", id: member.id })).toEqual(["type"]);
    expect(issuePaths({ type: "remove", id: member.id, force: true })).toEqual([""]);
    expect(issuePaths(edit({ categoryId: member.categoryId }))).toEqual(["set"]);
    expect(issuePaths(add({ salary: 1 } as Partial<Member>))).toEqual(["member"]);
  });
});
