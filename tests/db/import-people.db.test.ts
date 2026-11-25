import { randomUUID } from "node:crypto";

import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createCategory } from "@/db/categories";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { importPeople, loadImportablePeople } from "@/db/import-people";
import { categories, categoryRates, config, people } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import type { MatchedRow } from "@/lib/import/columns";

import { appPool, newOrganization } from "./support";

// docs/domain.md, "Importing a spreadsheet" > "Importing": the people file is checked again against
// the organization's people and categories, and written all or none, with any missing category
// created without a rate in the same transaction (ADR 0016).

const pool = appPool(2);
const app = drizzle(pool);
const organizations: string[] = [];
let organizationId: string;

const withRates = (id = organizationId): AccessContext => ({
  organizationId: id,
  rateAccess: true,
});
const viewer = (): AccessContext => ({ organizationId, rateAccess: false, readOnly: true });

const seniorRate = {
  grossAnnualSalaryCents: 5_200_000,
  socialSecurityBasisPoints: 3100,
  otherYearlyCostsCents: 300_000,
  manualCostPerHourCents: null,
  sellRateCents: 6500,
};

const EMPTY = { name: "", category: "", weeklyHours: "", area: "" };

let rowNumber = 1;
const row = (cells: Partial<typeof EMPTY>): MatchedRow<"people"> => ({
  row: (rowNumber += 1),
  cells: { ...EMPTY, ...cells },
  cellCountMatches: true,
});

/** An organization with its config, «Senior Developer» rated, «Project Manager» without a rate. */
async function seed(id: string) {
  const senior = await createCategory(app, withRates(id), {
    name: "Senior Developer",
    rate: seniorRate,
  });
  if (!senior.ok) throw new Error(senior.reason);
  const managerId = randomUUID();
  await withOrganization(app, withRates(id), async (tx) => {
    await tx
      .insert(config)
      .values({ organizationId: id, netAnnualHours: 1550, defaultWeeklyHours: 40 });
    await tx
      .insert(categories)
      .values({ id: managerId, organizationId: id, name: "Project Manager" });
    // docs/domain.md, "Import examples": «Persona 01», a Senior Developer at 40 hours a week, and
    // «Persona 05», who has left: people who are not active still count as existing.
    await tx.insert(people).values([
      {
        id: randomUUID(),
        organizationId: id,
        name: "Persona 01",
        categoryId: senior.categoryId,
        weeklyHours: 40,
        area: "Desarrollo",
      },
      {
        id: randomUUID(),
        organizationId: id,
        name: "Persona 05",
        categoryId: senior.categoryId,
        weeklyHours: 30,
        area: null,
        active: false,
      },
    ]);
  });
}

/** The organization's people and categories, as the database holds them, by name. */
const stored = (context: AccessContext = withRates()) =>
  withOrganization(app, context, async (tx) => {
    const named = await tx.select().from(categories).orderBy(asc(categories.name));
    const rated = new Set((await tx.select().from(categoryRates)).map((rate) => rate.categoryId));
    const byId = new Map(named.map((category) => [category.id, category.name]));
    const roster = await tx.select().from(people).orderBy(asc(people.name));
    return {
      categories: named.map(({ id, name }) => ({ name, rated: rated.has(id) })),
      people: roster.map(({ name, categoryId, weeklyHours, area, active }) => ({
        name,
        category: byId.get(categoryId),
        weeklyHours,
        area,
        active,
      })),
    };
  });

beforeEach(async () => {
  organizationId = await newOrganization(pool);
  organizations.push(organizationId);
  await seed(organizationId);
});

afterAll(async () => {
  for (const id of organizations) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await pool.end();
});

describe("loadImportablePeople", () => {
  it("reads people, inactive ones included, categories with whether they have a rate, and config", async () => {
    const loaded = await loadImportablePeople(app, withRates());
    expect(loaded?.defaultWeeklyHours).toBe(40);
    expect(loaded?.people.map(({ name }) => name)).toEqual(["Persona 01", "Persona 05"]);
    expect(loaded?.categories.map(({ name, hasRate }) => ({ name, hasRate }))).toEqual([
      { name: "Project Manager", hasRate: false },
      { name: "Senior Developer", hasRate: true },
    ]);
  });

  it("reads nothing without rate access", async () => {
    expect(await loadImportablePeople(app, viewer())).toBeNull();
  });
});

describe("importPeople", () => {
  it("creates, updates by name and creates a missing category once, without a rate", async () => {
    const result = await importPeople(app, withRates(), [
      // docs/domain.md, "Import examples": moves «Persona 01» to Project Manager at 32.5 hours.
      row({ name: "persona 01", category: "Project Manager", weeklyHours: "32,5" }),
      row({ name: "Persona 02", category: "Data Engineer" }),
      row({ name: "Persona 03", category: "data engineer", weeklyHours: "20", area: "Datos" }),
      // Inactive, and stays so: `active` is never in the file.
      row({ name: "Persona 05", category: "Senior Developer" }),
    ]);
    expect(result).toEqual({ ok: true, creates: 2, updates: 2, newCategories: 1 });
    expect(await stored()).toEqual({
      categories: [
        { name: "Data Engineer", rated: false },
        { name: "Project Manager", rated: false },
        { name: "Senior Developer", rated: true },
      ],
      people: [
        // Keeps their spelling and their area: an empty cell never erases a value.
        {
          name: "Persona 01",
          category: "Project Manager",
          weeklyHours: 32.5,
          area: "Desarrollo",
          active: true,
        },
        // Config's default weekly hours.
        {
          name: "Persona 02",
          category: "Data Engineer",
          weeklyHours: 40,
          area: null,
          active: true,
        },
        {
          name: "Persona 03",
          category: "Data Engineer",
          weeklyHours: 20,
          area: "Datos",
          active: true,
        },
        {
          name: "Persona 05",
          category: "Senior Developer",
          weeklyHours: 30,
          area: null,
          active: false,
        },
      ],
    });
  });

  it("writes nothing, not even a new category, when one row has an error", async () => {
    const before = await stored();
    // docs/domain.md, "Import examples": row 3 repeats row 2, so the file imports nothing.
    const result = await importPeople(app, withRates(), [
      row({ name: "Persona 03", category: "Project Manager", weeklyHours: "40" }),
      row({ name: "Persona 03", category: "Project Manager", weeklyHours: "40" }),
      row({ name: "Persona 04", category: "QA Engineer" }),
    ]);
    expect(result).toEqual({ ok: false, reason: "rows-changed" });
    expect(await stored()).toEqual(before);
  });

  it("refuses a viewer and writes nothing", async () => {
    const before = await stored();
    const result = await importPeople(app, viewer(), [
      row({ name: "Persona 02", category: "QA Engineer" }),
    ]);
    expect(result).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await stored()).toEqual(before);
  });

  it("refuses a read-only context even with rate access", async () => {
    const result = await importPeople(app, { organizationId, rateAccess: true, readOnly: true }, [
      row({ name: "Persona 02", category: "QA Engineer" }),
    ]);
    expect(result).toEqual({ ok: false, reason: "read-only" });
  });

  it("leaves another organization untouched", async () => {
    const otherId = await newOrganization(pool);
    organizations.push(otherId);
    await seed(otherId);
    const before = await stored(withRates(otherId));

    const result = await importPeople(app, withRates(), [
      row({ name: "Persona 01", category: "Project Manager", weeklyHours: "20" }),
      row({ name: "Persona 02", category: "QA Engineer" }),
    ]);
    expect(result).toEqual({ ok: true, creates: 1, updates: 1, newCategories: 1 });
    expect(await stored(withRates(otherId))).toEqual(before);
  });
});
