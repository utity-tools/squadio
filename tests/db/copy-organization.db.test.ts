import { randomUUID } from "node:crypto";

import { count, getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COPIED_TABLES, copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadScenario } from "@/db/load-scenario";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { appPool, ownerPool } from "./support";
import { OWNER_ONLY_TABLES } from "./tenancy";

// ADR 0011, "The copy": a visitor's copy of the demo organization, made by the app role in one
// transaction that switches the RLS context.

const app = drizzle(appPool(1));
const owner = drizzle(ownerPool());

const template: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
const copyOrg = randomUUID();
const copy: AccessContext = { organizationId: copyOrg, rateAccess: true };

const rowCounts = (context: AccessContext) =>
  withOrganization(app, context, async (tx) => {
    const counts: (number | undefined)[] = [];
    for (const table of COPIED_TABLES) {
      counts.push((await tx.select({ rows: count() }).from(table))[0]?.rows);
    }
    return counts;
  });

beforeAll(async () => {
  await seedDemo(app);
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, copyOrg));
});

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function collectIds(value: unknown, ids: Set<string>): void {
  if (typeof value === "string" && UUID.test(value)) ids.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectIds(item, ids));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectIds(v, ids));
}

/**
 * Replaces ids through `back` and sorts lists of rows by id (or category id): the loader breaks ties
 * in start dates by id, and the copy's ids sort differently, so the order of equal rows may differ.
 */
function normalize(value: unknown, back: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return back.get(value) ?? value;
  if (Array.isArray(value)) {
    const items = value.map((item) => normalize(item, back));
    const id = (item: unknown) =>
      item && typeof item === "object"
        ? String(("id" in item && item.id) || ("categoryId" in item && item.categoryId) || "")
        : "";
    return items.every((item) => id(item) !== "")
      ? items.toSorted((a, b) => id(a).localeCompare(id(b)))
      : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, back)]));
  }
  return value;
}

describe("copyOrganization", () => {
  it("copies every tenant table, once", async () => {
    const { rows } = await owner.execute<{ table: string }>(sql`
      select c.relname as table
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id'
       where c.relkind = 'r' and n.nspname = 'public'`);
    const ownerOnly = OWNER_ONLY_TABLES.map((table) => table.replace("public.", ""));
    expect(COPIED_TABLES.map((table) => getTableName(table)).toSorted()).toEqual(
      rows
        .map((row) => row.table)
        .filter((table) => !ownerOnly.includes(table))
        .toSorted(),
    );
  });

  it("returns the template ids it renamed", async () => {
    const renamed = await app.transaction((tx) =>
      copyOrganization(tx, DEMO_ORGANIZATION_ID, randomUUID()),
    );
    for (const id of [
      DEMO_IDS.project,
      DEMO_IDS.guideScenario,
      DEMO_IDS.guide.manager,
      DEMO_IDS.guide.cloud,
    ]) {
      expect(renamed.has(id), id).toBe(true);
    }
    expect(renamed.has(DEMO_ORGANIZATION_ID)).toBe(false);
  });

  it("leaves the transaction in the copy's context without rate access", async () => {
    const other = randomUUID();
    const context = await app.transaction(async (tx) => {
      await copyOrganization(tx, DEMO_ORGANIZATION_ID, other);
      const { rows } = await tx.execute<{ organization: string; rates: boolean }>(
        sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
      );
      return rows[0];
    });
    expect(context).toEqual({ organization: other, rates: false });
  });

  it("gives the copy as many rows as the template, in every table", async () => {
    const counts = await rowCounts(copy);
    expect(counts).toEqual(await rowCounts(template));
    expect(counts.every((rows) => (rows ?? 0) > 0)).toBe(true);
  });

  it("loads each scenario of the copy exactly as the template's, under the derived ids", async () => {
    for (const id of [DEMO_IDS.guideScenario, DEMO_IDS.overBudgetScenario]) {
      const original = await loadScenario(app, template, id);
      const copied = await loadScenario(app, copy, copyId(id, copyOrg));
      if (!original || !copied) throw new Error("expected both scenarios to load");

      // Every id of the template, so the copy's can be read back as the template's.
      const templateIds = new Set<string>();
      collectIds(original, templateIds);
      const back = new Map(
        [...templateIds].map((templateId) => [copyId(templateId, copyOrg), templateId]),
      );
      expect(normalize(copied, back)).toEqual(normalize(original, new Map()));
    }
  });

  it("leaves the template untouched and the copy invisible to other organizations", async () => {
    const before = await rowCounts(template);
    await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, randomUUID()));
    expect(await rowCounts(template)).toEqual(before);

    const stranger: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    expect(await loadScenario(app, stranger, copyId(DEMO_IDS.guideScenario, copyOrg))).toBeNull();
  });

  it("refuses to copy an organization onto itself", async () => {
    await expect(
      app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, DEMO_ORGANIZATION_ID)),
    ).rejects.toThrow(RangeError);
  });

  it("refuses a target that already has rows, and writes nothing", async () => {
    const before = await rowCounts(copy);
    await expect(
      app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, copyOrg)),
    ).rejects.toThrow();
    expect(await rowCounts(copy)).toEqual(before);
  });
});
