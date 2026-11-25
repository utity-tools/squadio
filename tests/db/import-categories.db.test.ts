import { randomUUID } from "node:crypto";

import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createCategory } from "@/db/categories";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { importCategories, loadImportableCategories } from "@/db/import-categories";
import { categories, categoryRates } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import type { MatchedRow } from "@/lib/import/columns";

import { appPool, newOrganization } from "./support";

// docs/domain.md, "Importing a spreadsheet" > "Importing": one transaction checks every row again
// against what the database holds and writes all of them, or none (ADR 0016).

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

const EMPTY = {
  name: "",
  grossAnnualSalary: "",
  socialSecurity: "",
  otherYearlyCosts: "",
  sellRate: "",
  manualCostPerHour: "",
};

let rowNumber = 1;
const row = (cells: Partial<typeof EMPTY>): MatchedRow<"categories"> => ({
  row: (rowNumber += 1),
  cells: { ...EMPTY, ...cells },
  cellCountMatches: true,
});

/** The organization's categories with their rate, as the database holds them. */
const stored = (context: AccessContext = withRates()) =>
  withOrganization(app, context, async (tx) => {
    const named = await tx.select().from(categories).orderBy(asc(categories.name));
    const rates = await tx.select().from(categoryRates);
    return named.map(({ id, name }) => {
      const rate = rates.find((r) => r.categoryId === id);
      return {
        name,
        rate: rate && {
          grossAnnualSalary: rate.grossAnnualSalary,
          socialSecurity: rate.socialSecurity,
          otherYearlyCosts: rate.otherYearlyCosts,
          manualCostPerHour: rate.manualCostPerHour,
          sellRate: rate.sellRate,
        },
      };
    });
  });

beforeEach(async () => {
  organizationId = await newOrganization(pool);
  organizations.push(organizationId);
  // docs/domain.md, "Import examples": «Senior Developer» with its rate, «Cloud Architect» without.
  const result = await createCategory(app, withRates(), {
    name: "Senior Developer",
    rate: seniorRate,
  });
  if (!result.ok) throw new Error(result.reason);
  await withOrganization(app, withRates(), (tx) =>
    tx.insert(categories).values({ id: randomUUID(), organizationId, name: "Cloud Architect" }),
  );
});

afterAll(async () => {
  for (const id of organizations) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await pool.end();
});

describe("loadImportableCategories", () => {
  it("reads each category's name and whether it has a rate", async () => {
    const loaded = await loadImportableCategories(app, withRates());
    expect(loaded?.map(({ name, hasRate }) => ({ name, hasRate }))).toEqual([
      { name: "Cloud Architect", hasRate: false },
      { name: "Senior Developer", hasRate: true },
    ]);
  });

  it("reads nothing without rate access", async () => {
    expect(await loadImportableCategories(app, viewer())).toBeNull();
  });
});

describe("importCategories", () => {
  it("creates, completes and updates in one go", async () => {
    const result = await importCategories(
      app,
      withRates(),
      [
        row({ name: "Senior developer", grossAnnualSalary: "55.000" }),
        row({ name: "QA Engineer", grossAnnualSalary: "38.000", sellRate: "45" }),
        row({
          name: "Cloud Architect",
          grossAnnualSalary: "60.000",
          socialSecurity: "31",
          otherYearlyCosts: "3.000",
          sellRate: "80",
        }),
      ],
      "es",
    );
    expect(result).toEqual({ ok: true, creates: 1, updates: 2 });
    expect(await stored()).toEqual([
      {
        name: "Cloud Architect",
        rate: {
          grossAnnualSalary: 6_000_000,
          socialSecurity: 3100,
          otherYearlyCosts: 300_000,
          manualCostPerHour: null,
          sellRate: 8000,
        },
      },
      {
        name: "QA Engineer",
        rate: {
          grossAnnualSalary: 3_800_000,
          socialSecurity: 3100,
          otherYearlyCosts: 300_000,
          manualCostPerHour: null,
          sellRate: 4500,
        },
      },
      {
        // Keeps its spelling, and every cell the row left empty.
        name: "Senior Developer",
        rate: {
          grossAnnualSalary: 5_500_000,
          socialSecurity: 3100,
          otherYearlyCosts: 300_000,
          manualCostPerHour: null,
          sellRate: 6500,
        },
      },
    ]);
  });

  it("reads amounts as the file's locale writes them", async () => {
    const result = await importCategories(
      app,
      withRates(),
      [row({ name: "Data Engineer", grossAnnualSalary: "52000.50", sellRate: "64" })],
      "en",
    );
    expect(result).toEqual({ ok: true, creates: 1, updates: 0 });
    expect((await stored()).find((c) => c.name === "Data Engineer")?.rate).toMatchObject({
      grossAnnualSalary: 5_200_050,
    });
  });

  it("writes nothing when one row has an error", async () => {
    const before = await stored();
    const result = await importCategories(
      app,
      withRates(),
      [
        row({ name: "QA Engineer", grossAnnualSalary: "38.000", sellRate: "45" }),
        row({ name: "Senior Developer", grossAnnualSalary: "1" }),
        row({ name: "UX Designer", grossAnnualSalary: "40.000", socialSecurity: "131" }),
      ],
      "es",
    );
    expect(result).toEqual({ ok: false, reason: "rows-changed" });
    expect(await stored()).toEqual(before);
  });

  it("checks the rows against the database, not against what the page saw", async () => {
    // A page that believed «Cloud Architect» had a rate would plan to update its sell rate alone;
    // the database says it has none, so the row needs its whole rate and the import is refused.
    const before = await stored();
    const result = await importCategories(
      app,
      withRates(),
      [row({ name: "Cloud Architect", sellRate: "90" })],
      "es",
    );
    expect(result).toEqual({ ok: false, reason: "rows-changed" });
    expect(await stored()).toEqual(before);
  });

  it("refuses a viewer and writes nothing", async () => {
    const before = await stored();
    const result = await importCategories(
      app,
      viewer(),
      [row({ name: "QA Engineer", grossAnnualSalary: "38.000", sellRate: "45" })],
      "es",
    );
    expect(result).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await stored()).toEqual(before);
  });

  it("refuses a read-only context even with rate access", async () => {
    const result = await importCategories(
      app,
      { organizationId, rateAccess: true, readOnly: true },
      [row({ name: "QA Engineer", grossAnnualSalary: "38.000", sellRate: "45" })],
      "es",
    );
    expect(result).toEqual({ ok: false, reason: "read-only" });
  });

  it("leaves another organization untouched", async () => {
    const otherId = await newOrganization(pool);
    organizations.push(otherId);
    const theirs = await createCategory(app, withRates(otherId), {
      name: "Senior Developer",
      rate: seniorRate,
    });
    if (!theirs.ok) throw new Error(theirs.reason);
    const before = await stored(withRates(otherId));

    const result = await importCategories(
      app,
      withRates(),
      [
        row({ name: "Senior Developer", sellRate: "90" }),
        row({ name: "QA Engineer", grossAnnualSalary: "38.000", sellRate: "45" }),
      ],
      "es",
    );
    expect(result).toEqual({ ok: true, creates: 1, updates: 1 });
    expect(await stored(withRates(otherId))).toEqual(before);
  });
});
