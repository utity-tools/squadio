import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { copyOrganization } from "@/db/copy-organization";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { scenarios } from "@/db/schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization } from "./support";

// docs/domain.md, "Derived alternative" and "Retention"; ADR 0013: a scenario records the revision
// it was derived from, who derived it and when. The revision is cleared when it is deleted with
// its scenario and the author when their account is; when it was derived stays. Synthetic data.

const pool = appPool(2);
const app = drizzle(pool);

let organizationId: string;
const context = (): AccessContext => ({ organizationId, rateAccess: true });
const ours = (id: string) => copyId(id, organizationId);
const created: string[] = [];
const users: string[] = [];

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  organizationId = await newOrganization(app);
  created.push(organizationId);
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
});

afterAll(async () => {
  for (const id of created) await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  await pool.query(`delete from auth."user" where id = any($1)`, [users]);
  await pool.end();
});

async function newUser() {
  const { rows } = await pool.query<{ id: string }>(
    `insert into auth."user" (name, email) values ('Grace Synthetic', $1) returning id`,
    [`grace-${randomUUID()}@example.test`],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("expected a user");
  users.push(id);
  return id;
}

/** A new scenario of the delivery project with the provenance given. */
const insertScenario = (provenance: Partial<typeof scenarios.$inferInsert>) =>
  withOrganization(app, context(), async (tx) => {
    const id = randomUUID();
    await tx.insert(scenarios).values({
      id,
      organizationId,
      projectId: await projectOf(tx, ours(DEMO_IDS.deliveryScenario)),
      name: `Alternative ${id}`,
      ...provenance,
    });
    return id;
  });

async function projectOf(tx: TenantTransaction, scenarioId: string) {
  const [row] = await tx
    .select({ projectId: scenarios.projectId })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId));
  if (!row) throw new Error("expected the scenario");
  return row.projectId;
}

const provenanceOf = (scenarioId: string) =>
  withOrganization(app, context(), async (tx) => {
    const [row] = await tx
      .select({
        derivedFromRevisionId: scenarios.derivedFromRevisionId,
        derivedBy: scenarios.derivedBy,
        derivedAt: scenarios.derivedAt,
      })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    return row;
  });

const DERIVED_AT = new Date("2026-10-28T12:00:00Z");

describe("a scenario's provenance", () => {
  it("records the revision an alternative came from, its author and when", async () => {
    const author = await newUser();
    const id = await insertScenario({
      derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision),
      derivedBy: author,
      derivedAt: DERIVED_AT,
    });
    expect(await provenanceOf(id)).toEqual({
      derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision),
      derivedBy: author,
      derivedAt: DERIVED_AT,
    });
  });

  it("is empty for a scenario that is not an alternative", async () => {
    const id = await insertScenario({});
    expect(await provenanceOf(id)).toEqual({
      derivedFromRevisionId: null,
      derivedBy: null,
      derivedAt: null,
    });
  });

  it("refuses a revision or an author without when it was derived", async () => {
    await expect(
      insertScenario({ derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision) }),
    ).rejects.toMatchObject({ cause: { constraint: "scenarios_derived_check" } });
    await expect(insertScenario({ derivedBy: await newUser() })).rejects.toMatchObject({
      cause: { constraint: "scenarios_derived_check" },
    });
  });

  it("refuses another organization's revision, when the transaction commits", async () => {
    await expect(
      insertScenario({ derivedFromRevisionId: DEMO_IDS.deliveryRevision, derivedAt: DERIVED_AT }),
    ).rejects.toMatchObject({ cause: { constraint: "scenarios_derived_from_revision_fkey" } });
  });

  it("keeps that it was derived once its revision is deleted with its scenario", async () => {
    const id = await insertScenario({
      derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision),
      derivedAt: DERIVED_AT,
    });
    await withOrganization(app, context(), (tx) =>
      tx.delete(scenarios).where(eq(scenarios.id, ours(DEMO_IDS.deliveryScenario))),
    );
    expect(await provenanceOf(id)).toEqual({
      derivedFromRevisionId: null,
      derivedBy: null,
      derivedAt: DERIVED_AT,
    });
  });

  it("loses its author when their account is deleted", async () => {
    const author = await newUser();
    const id = await insertScenario({
      derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision),
      derivedBy: author,
      derivedAt: DERIVED_AT,
    });
    await pool.query(`delete from auth."user" where id = $1`, [author]);
    expect(await provenanceOf(id)).toEqual({
      derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision),
      derivedBy: null,
      derivedAt: DERIVED_AT,
    });
  });

  it("follows a visitor's copy: the copy's revision, and nobody as its author", async () => {
    const author = await newUser();
    const id = await insertScenario({
      derivedFromRevisionId: ours(DEMO_IDS.deliveryRevision),
      derivedBy: author,
      derivedAt: DERIVED_AT,
    });
    const copy = await newOrganization(app);
    created.push(copy);
    await app.transaction((tx) => copyOrganization(tx, organizationId, copy));
    const [row] = await withOrganization(app, { organizationId: copy, rateAccess: false }, (tx) =>
      tx
        .select({
          derivedFromRevisionId: scenarios.derivedFromRevisionId,
          derivedBy: scenarios.derivedBy,
          derivedAt: scenarios.derivedAt,
        })
        .from(scenarios)
        .where(eq(scenarios.id, copyId(id, copy))),
    );
    expect(row).toEqual({
      derivedFromRevisionId: copyId(ours(DEMO_IDS.deliveryRevision), copy),
      derivedBy: null,
      derivedAt: DERIVED_AT,
    });
  });
});
