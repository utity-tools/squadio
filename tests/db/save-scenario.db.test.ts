import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { saveChangesIn, saveScenarioChanges } from "@/db/save-scenario";
import { assignments, scenarios } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import type { Change, Member } from "@/lib/scenarios/change";
import { copyId } from "@/lib/visitors/copy-id";

import { appPool } from "./support";

// ADR 0011, "Saving": changes saved against a version, re-checked on the stored team.

const app = drizzle(appPool(1));
/** The seed's Senior Developer category: its ids are fixed (demo-seed.ts). */
const SENIOR_CATEGORY = "6d656d6f-0000-4000-8000-000000000010";

afterAll(async () => {
  await app.$client.end();
});

let copyOrg: string;
let visitor: AccessContext;
let scenarioId: string;
const seat = (templateId: string) => copyId(templateId, copyOrg);

beforeEach(async () => {
  await seedDemo(app);
  copyOrg = randomUUID();
  visitor = { organizationId: copyOrg, rateAccess: false };
  scenarioId = seat(DEMO_IDS.guideScenario);
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, copyOrg));
});

const stored = (context: AccessContext = visitor) =>
  withOrganization(app, context, async (tx) => {
    const [scenario] = await tx
      .select({ version: scenarios.version })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    const team = await tx
      .select({
        id: assignments.id,
        reportsTo: assignments.reportsTo,
        allocation: assignments.allocation,
      })
      .from(assignments)
      .where(eq(assignments.scenarioId, scenarioId))
      .orderBy(assignments.id);
    return { version: scenario?.version, team };
  });

const save = (changes: Change[], baseVersion = 1, context = visitor) =>
  saveScenarioChanges(app, context, { scenarioId, baseVersion, changes });

describe("saveScenarioChanges", () => {
  it("applies the changes and moves the version on", async () => {
    const result = await save([
      { type: "move", id: seat(DEMO_IDS.guide.devops), reportsTo: seat(DEMO_IDS.guide.senior) },
      { type: "edit", id: seat(DEMO_IDS.guide.senior), set: { allocation: 80 } },
    ]);
    expect(result).toEqual({ ok: true, version: 2 });

    const { version, team } = await stored();
    expect(version).toBe(2);
    expect(team.find((m) => m.id === seat(DEMO_IDS.guide.devops))?.reportsTo).toBe(
      seat(DEMO_IDS.guide.senior),
    );
    expect(team.find((m) => m.id === seat(DEMO_IDS.guide.senior))?.allocation).toBe(80);
  });

  it("adds, removes and restores assignments, keeping reports in place", async () => {
    const before = await stored();
    const added: Member = {
      id: randomUUID(),
      projectRole: "QA",
      categoryId: seat(SENIOR_CATEGORY),
      personId: null,
      reportsTo: seat(DEMO_IDS.guide.senior),
      weeklyHours: 40,
      allocation: 50,
      startDate: "2027-04-01",
      endDate: "2027-09-29",
    };
    expect(await save([{ type: "add", member: added }])).toEqual({ ok: true, version: 2 });
    expect((await stored()).team.map((m) => m.id)).toContain(added.id);

    // Removing the manager moves their reports up, so they become roots.
    expect(await save([{ type: "remove", id: seat(DEMO_IDS.guide.manager) }], 2)).toEqual({
      ok: true,
      version: 3,
    });
    const removed = await stored();
    expect(removed.team.map((m) => m.id)).not.toContain(seat(DEMO_IDS.guide.manager));
    expect(removed.team.filter((m) => m.reportsTo === null)).toHaveLength(3);

    // Removing and restoring in one save leaves the rows as they were.
    const { team } = await stored();
    const qa = { ...added, reportsTo: seat(DEMO_IDS.guide.senior) };
    expect(
      await save(
        [
          { type: "remove", id: added.id },
          { type: "restore", member: qa, reports: [] },
        ],
        3,
      ),
    ).toEqual({ ok: true, version: 4 });
    expect((await stored()).team).toEqual(team);
    expect(before.team).toHaveLength(4);
  });

  it("refuses a stale version as a conflict and writes nothing", async () => {
    await save([{ type: "edit", id: seat(DEMO_IDS.guide.senior), set: { allocation: 80 } }]);
    const result = await save([
      { type: "edit", id: seat(DEMO_IDS.guide.senior), set: { allocation: 60 } },
    ]);
    expect(result).toEqual({ ok: false, reason: "conflict", version: 2 });
    expect(
      (await stored()).team.find((m) => m.id === seat(DEMO_IDS.guide.senior))?.allocation,
    ).toBe(80);
  });

  it("refuses a change the stored team rejects, saying which, and writes nothing", async () => {
    const before = await stored();
    const result = await save([
      { type: "edit", id: seat(DEMO_IDS.guide.senior), set: { allocation: 10 } },
      { type: "move", id: seat(DEMO_IDS.guide.manager), reportsTo: seat(DEMO_IDS.guide.senior) },
    ]);
    expect(result).toEqual({ ok: false, reason: "cycle", index: 1 });
    expect(await stored()).toEqual(before);
  });

  it("refuses a chosen scenario", async () => {
    const owner: AccessContext = { organizationId: copyOrg, rateAccess: true };
    await withOrganization(app, owner, (tx) =>
      tx.update(scenarios).set({ chosen: true }).where(eq(scenarios.id, scenarioId)),
    );
    expect(await save([{ type: "remove", id: seat(DEMO_IDS.guide.devops) }])).toEqual({
      ok: false,
      reason: "chosen",
    });
  });

  it("never writes to the demo template, whatever the caller believes", async () => {
    const template: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
    const before = await templateTeam();
    const input = {
      scenarioId: DEMO_IDS.guideScenario,
      baseVersion: 1,
      changes: [{ type: "edit", id: DEMO_IDS.guide.senior, set: { allocation: 7 } }] as Change[],
    };
    expect(await saveScenarioChanges(app, template, input)).toEqual({
      ok: false,
      reason: "template",
    });
    // The organization comes from the transaction's context, so a caller cannot talk past it.
    expect(await withOrganization(app, template, (tx) => saveChangesIn(tx, input))).toEqual({
      ok: false,
      reason: "template",
    });
    expect(await templateTeam()).toEqual(before);
  });

  it("refuses an id another organization's assignment holds, and writes nothing", async () => {
    const before = await stored();
    const taken = { ...(await copiedSenior()), id: DEMO_IDS.guide.senior, personId: null };
    expect(await save([{ type: "add", member: taken }])).toEqual({
      ok: false,
      reason: "id-taken",
      index: 0,
    });
    expect(await stored()).toEqual(before);
  });

  it("finds no scenario of another organization", async () => {
    const stranger: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    expect(await save([{ type: "remove", id: seat(DEMO_IDS.guide.devops) }], 1, stranger)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses input that is not a valid list of changes", async () => {
    await expect(save([])).rejects.toBeInstanceOf(ZodError);
    await expect(
      saveScenarioChanges(app, visitor, {
        scenarioId,
        baseVersion: 1,
        changes: [{ type: "edit", id: seat(DEMO_IDS.guide.senior), set: { allocation: 101 } }],
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

const templateTeam = () =>
  withOrganization(app, { organizationId: DEMO_ORGANIZATION_ID, rateAccess: false }, (tx) =>
    tx
      .select({ id: assignments.id, allocation: assignments.allocation })
      .from(assignments)
      .orderBy(assignments.id),
  );

/** The copy's senior seat, as a member to add under another id. */
const copiedSenior = async (): Promise<Member> => {
  const [row] = await withOrganization(app, visitor, (tx) =>
    tx
      .select({
        id: assignments.id,
        projectRole: assignments.projectRole,
        categoryId: assignments.categoryId,
        personId: assignments.personId,
        reportsTo: assignments.reportsTo,
        weeklyHours: assignments.weeklyHours,
        allocation: assignments.allocation,
        startDate: assignments.startDate,
        endDate: assignments.endDate,
      })
      .from(assignments)
      .where(eq(assignments.id, seat(DEMO_IDS.guide.senior))),
  );
  if (!row) throw new Error("expected the copy's senior seat");
  return row;
};
