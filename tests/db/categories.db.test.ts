import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCategory, loadCategoryCosts, updateCategory } from "@/db/categories";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { categories, categoryRates, config, people } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import type { CategoryForm } from "@/lib/categories/category-form";

import { appPool, newOrganization } from "./support";

// ADR 0005: a category is structural and everyone in the organization reads its name; its rate is
// restricted. Creating or editing one writes both, so it needs rate access.

const pool = appPool(2);
const app = drizzle(pool);
let organizationId: string;
let otherOrganizationId: string;

beforeAll(async () => {
  organizationId = await newOrganization(pool);
  otherOrganizationId = await newOrganization(pool);
  await withOrganization(app, withRates(), (tx) =>
    tx.insert(config).values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 }),
  );
});

afterAll(async () => {
  for (const id of [organizationId, otherOrganizationId]) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await pool.end();
});

function withRates() {
  return { organizationId, rateAccess: true };
}
const withoutRates = () => ({ organizationId, rateAccess: false });

const rate = {
  grossAnnualSalaryCents: 5_000_000,
  socialSecurityBasisPoints: 3100,
  otherYearlyCostsCents: 300_000,
  manualCostPerHourCents: null,
  sellRateCents: 6200,
};
let names = 0;
const devOps = (): CategoryForm => ({ name: `DevOps Engineer ${(names += 1)}`, rate });

const created = async (form: CategoryForm = devOps()) => {
  const result = await createCategory(app, withRates(), form);
  if (!result.ok) throw new Error(`expected the category, got ${result.reason}`);
  return result.categoryId;
};

const readRate = (categoryId: string) =>
  withOrganization(app, withRates(), async (tx) => {
    const rows = await tx.select().from(categoryRates);
    return rows.find((row) => row.categoryId === categoryId);
  });

describe("createCategory", () => {
  it("creates a category with its rate", async () => {
    const form = devOps();
    const categoryId = await created(form);
    const named = await withOrganization(app, withoutRates(), (tx) => tx.select().from(categories));
    expect(named).toContainEqual({ id: categoryId, organizationId, name: form.name });
    expect(await readRate(categoryId)).toEqual({
      organizationId,
      categoryId,
      grossAnnualSalary: 5_000_000,
      socialSecurity: 3100,
      otherYearlyCosts: 300_000,
      manualCostPerHour: null,
      sellRate: 6200,
    });
  });

  it("refuses a name the organization already uses, and writes nothing", async () => {
    const form = devOps();
    await created(form);
    const result = await createCategory(app, withRates(), {
      ...form,
      rate: { ...rate, sellRateCents: 1 },
    });
    expect(result).toEqual({ ok: false, reason: "name-taken" });
  });

  it("lets another organization use the same name", async () => {
    const form = devOps();
    await created(form);
    const result = await createCategory(
      app,
      { organizationId: otherOrganizationId, rateAccess: true },
      form,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses without rate access and writes nothing", async () => {
    const form = devOps();
    expect(await createCategory(app, withoutRates(), form)).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    const named = await withOrganization(app, withRates(), (tx) => tx.select().from(categories));
    expect(named.map((row) => row.name)).not.toContain(form.name);
  });
});

describe("updateCategory", () => {
  it("renames a category and replaces its rate", async () => {
    const categoryId = await created();
    const result = await updateCategory(app, withRates(), categoryId, {
      name: "Platform Engineer",
      rate: { ...rate, manualCostPerHourCents: 5000, sellRateCents: 7000 },
    });
    expect(result).toEqual({ ok: true });
    expect(await readRate(categoryId)).toMatchObject({ manualCostPerHour: 5000, sellRate: 7000 });
  });

  it("gives a category without a rate its first one (rule k)", async () => {
    const categoryId = randomUUID();
    await withOrganization(app, withRates(), (tx) =>
      tx
        .insert(categories)
        .values({ id: categoryId, organizationId, name: `No rate ${categoryId}` }),
    );
    expect(await updateCategory(app, withRates(), categoryId, devOps())).toEqual({ ok: true });
    expect(await readRate(categoryId)).toMatchObject({ sellRate: 6200 });
  });

  it("refuses another category's name", async () => {
    const taken = devOps();
    await created(taken);
    const categoryId = await created();
    expect(await updateCategory(app, withRates(), categoryId, taken)).toEqual({
      ok: false,
      reason: "name-taken",
    });
  });

  it("finds no category of another organization", async () => {
    const categoryId = await created();
    const result = await updateCategory(
      app,
      { organizationId: otherOrganizationId, rateAccess: true },
      categoryId,
      devOps(),
    );
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(await readRate(categoryId)).toMatchObject({ sellRate: 6200 });
  });

  it("refuses without rate access", async () => {
    const categoryId = await created();
    expect(await updateCategory(app, withoutRates(), categoryId, devOps())).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
  });
});

describe("loadCategoryCosts", () => {
  it("reads every category with its rate or none, the people rule j counts and the hours", async () => {
    const categoryId = await created({ name: "Aaa first", rate });
    const bare = randomUUID();
    await withOrganization(app, withRates(), async (tx) => {
      await tx.insert(categories).values({ id: bare, organizationId, name: "Aaa second" });
      await tx.insert(people).values({
        id: randomUUID(),
        organizationId,
        name: "Synthetic Person",
        categoryId,
        weeklyHours: 40,
      });
    });
    const loaded = await loadCategoryCosts(app, withRates());
    expect(loaded?.netAnnualHours).toBe(1550);
    expect(loaded?.categories.slice(0, 2)).toEqual([
      { id: categoryId, name: "Aaa first", rate },
      { id: bare, name: "Aaa second", rate: null },
    ]);
    expect(loaded?.people).toContainEqual(expect.objectContaining({ categoryId, active: true }));
  });

  it("reads nothing without rate access", async () => {
    expect(await loadCategoryCosts(app, withoutRates())).toBeNull();
  });
});
