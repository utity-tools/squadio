import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { assignments, categories, config, people, projects, scenarios } from "@/db/schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "@/db/tenant";

import { appPool, ownerPool } from "./support";
import { OWNER_ONLY_TABLES, RESTRICTED_TABLES, STRUCTURAL_TABLES } from "./tenancy";

// The structural tables of v0.1 (docs/domain.md, ADR 0004): isolated per organization, pointing
// only inside it, and holding the constraints of the domain rules. Synthetic data only.

const app = drizzle(appPool(1));
const owner = drizzle(ownerPool());

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const contextFor = (organizationId = randomUUID()): AccessContext => ({
  organizationId,
  rateAccess: false,
});

const inOrganization = <T>(context: AccessContext, fn: (tx: TenantTransaction) => Promise<T>) =>
  withOrganization(app, context, fn);

/** A small team in one organization: a category, a person, a project, a scenario, two seats. */
async function seedTeam(tx: TenantTransaction, organizationId: string) {
  await tx.insert(config).values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 });
  const [category] = await tx
    .insert(categories)
    .values({ organizationId, name: "Senior Developer" })
    .returning();
  const [person] = await tx
    .insert(people)
    .values({ organizationId, name: "Person A", categoryId: category!.id, weeklyHours: 37.33 })
    .returning();
  const [project] = await tx
    .insert(projects)
    .values({ organizationId, name: "Project A", client: "Client A", pricingModel: "fixed" })
    .returning();
  const [scenario] = await tx
    .insert(scenarios)
    .values({ organizationId, projectId: project!.id, name: "Plan A" })
    .returning();
  const seat = {
    organizationId,
    scenarioId: scenario!.id,
    categoryId: category!.id,
    weeklyHours: 40,
    allocation: 100,
    startDate: "2027-04-01",
    endDate: "2027-09-29",
  };
  const [lead] = await tx
    .insert(assignments)
    .values({ ...seat, personId: person!.id, projectRole: "Tech lead" })
    .returning();
  const [openRole] = await tx
    .insert(assignments)
    .values({ ...seat, projectRole: "Developer", reportsTo: lead!.id, allocation: 50 })
    .returning();
  return {
    category: category!,
    person: person!,
    project: project!,
    scenario: scenario!,
    lead: lead!,
    openRole: openRole!,
  };
}

const counts = (tx: Pick<TenantTransaction, "select">) =>
  Promise.all(
    [config, categories, people, projects, scenarios, assignments].map(async (table) => {
      const [row] = await tx.select({ rows: count() }).from(table);
      return row?.rows;
    }),
  );

describe("v0.1 tenant tables", () => {
  it("lists every table with organization_id as structural, restricted or owner-only", async () => {
    const { rows } = await owner.execute<{ table: string }>(sql`
      select n.nspname || '.' || c.relname as table
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id'
       where c.relkind = 'r' and n.nspname = 'public'
       order by 1`);

    expect(rows.map((row) => row.table)).toEqual(
      [...STRUCTURAL_TABLES, ...RESTRICTED_TABLES, ...OWNER_ONLY_TABLES].toSorted(),
    );
  });
});

describe("structural tables", () => {
  it("show an organization's rows to it and to no other organization", async () => {
    const a = contextFor();
    await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));

    expect(await inOrganization(a, counts)).toEqual([1, 1, 1, 1, 1, 2]);
    expect(await inOrganization(contextFor(), counts)).toEqual([0, 0, 0, 0, 0, 0]);
    // Outside withOrganization there is no context, so nothing at all.
    expect(await counts(app)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("let everyone in the organization read them, with or without rate access", async () => {
    const a = contextFor();
    await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));

    expect(await inOrganization({ ...a, rateAccess: true }, counts)).toEqual([1, 1, 1, 1, 1, 2]);
  });

  it("keep weekly hours with their two decimals", async () => {
    const a = contextFor();
    const { person } = await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));

    const [read] = await inOrganization(a, (tx) =>
      tx.select({ weeklyHours: people.weeklyHours }).from(people).where(eq(people.id, person.id)),
    );
    expect(read).toEqual({ weeklyHours: 37.33 });
  });

  it("refuse a reference to another organization's row", async () => {
    const a = contextFor();
    const { category } = await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));
    const b = contextFor();

    await expect(
      inOrganization(b, (tx) =>
        tx.insert(people).values({
          organizationId: b.organizationId,
          name: "Person B",
          categoryId: category.id,
          weeklyHours: 40,
        }),
      ),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("refuse a reports-to outside the assignment's scenario", async () => {
    const a = contextFor();
    const { project, lead, category } = await inOrganization(a, (tx) =>
      seedTeam(tx, a.organizationId),
    );

    await expect(
      inOrganization(a, async (tx) => {
        const [other] = await tx
          .insert(scenarios)
          .values({ organizationId: a.organizationId, projectId: project.id, name: "Plan B" })
          .returning();
        await tx.insert(assignments).values({
          organizationId: a.organizationId,
          scenarioId: other!.id,
          categoryId: category.id,
          projectRole: "Developer",
          reportsTo: lead.id,
          weeklyHours: 40,
          allocation: 100,
          startDate: "2027-04-01",
          endDate: "2027-09-29",
        });
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("allow at most one chosen scenario per project (rule i)", async () => {
    const a = contextFor();
    const { project, scenario } = await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));
    await inOrganization(a, (tx) =>
      tx.update(scenarios).set({ chosen: true }).where(eq(scenarios.id, scenario.id)),
    );

    await expect(
      inOrganization(a, (tx) =>
        tx.insert(scenarios).values({
          organizationId: a.organizationId,
          projectId: project.id,
          name: "Plan B",
          chosen: true,
        }),
      ),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    // Unchosen scenarios are not limited.
    await inOrganization(a, (tx) =>
      tx.insert(scenarios).values([
        { organizationId: a.organizationId, projectId: project.id, name: "Plan C" },
        { organizationId: a.organizationId, projectId: project.id, name: "Plan D" },
      ]),
    );
  });

  it("clear reports-to when the assignment it points to is deleted", async () => {
    const a = contextFor();
    const { lead, openRole } = await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));

    await inOrganization(a, (tx) => tx.delete(assignments).where(eq(assignments.id, lead.id)));

    const [after] = await inOrganization(a, (tx) =>
      tx.select().from(assignments).where(eq(assignments.id, openRole.id)),
    );
    expect(after).toMatchObject({ reportsTo: null, organizationId: a.organizationId });
  });

  it("delete a project's scenarios and assignments with it", async () => {
    const a = contextFor();
    const { project } = await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));

    await inOrganization(a, (tx) => tx.delete(projects).where(eq(projects.id, project.id)));

    expect(await inOrganization(a, counts)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  describe("check constraints", () => {
    type Seeded = Awaited<ReturnType<typeof seedTeam>>;
    const cases: [string, (tx: TenantTransaction, seeded: Seeded) => Promise<unknown>][] = [
      [
        "allocation above 100",
        (tx, { lead }) =>
          tx.update(assignments).set({ allocation: 101 }).where(eq(assignments.id, lead.id)),
      ],
      [
        "allocation below 0",
        (tx, { lead }) =>
          tx.update(assignments).set({ allocation: -1 }).where(eq(assignments.id, lead.id)),
      ],
      [
        "an assignment that ends before it starts",
        (tx, { lead }) =>
          tx.update(assignments).set({ endDate: "2027-03-31" }).where(eq(assignments.id, lead.id)),
      ],
      [
        "an assignment that reports to itself",
        (tx, { lead }) =>
          tx.update(assignments).set({ reportsTo: lead.id }).where(eq(assignments.id, lead.id)),
      ],
      [
        "zero weekly hours",
        (tx, { person }) =>
          tx.update(people).set({ weeklyHours: 0 }).where(eq(people.id, person.id)),
      ],
      [
        "a blank category name",
        (tx, { category }) =>
          tx.update(categories).set({ name: "  " }).where(eq(categories.id, category.id)),
      ],
      [
        "a name over 100 characters",
        (tx, { project }) =>
          tx
            .update(projects)
            .set({ name: "x".repeat(101) })
            .where(eq(projects.id, project.id)),
      ],
      [
        "a blank client",
        (tx, { project }) =>
          tx.update(projects).set({ client: " " }).where(eq(projects.id, project.id)),
      ],
      ["zero net annual hours", (tx) => tx.update(config).set({ netAnnualHours: 0 })],
      [
        "a scenario version below 1",
        (tx, { scenario }) =>
          tx.update(scenarios).set({ version: 0 }).where(eq(scenarios.id, scenario.id)),
      ],
    ];

    it.each(cases)("reject %s", async (_name, write) => {
      const a = contextFor();
      const seeded = await inOrganization(a, (tx) => seedTeam(tx, a.organizationId));

      await expect(inOrganization(a, (tx) => write(tx, seeded))).rejects.toMatchObject({
        cause: { code: "23514" },
      });
    });
  });
});
