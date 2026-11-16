import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProject, updateProject } from "@/db/create-project";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { projectPricing, projects } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import type { NewProject } from "@/lib/projects/new-project";

import { appPool, newOrganization } from "./support";

// ADR 0005: a project is structural and everyone in the organization reads it; its price lives in
// project_pricing, which only rate access reads or writes. Creating a project writes both, so it
// needs rate access.

const pool = appPool(2);
const app = drizzle(pool);
let organizationId: string;
let otherOrganizationId: string;

beforeAll(async () => {
  organizationId = await newOrganization(pool);
  otherOrganizationId = await newOrganization(pool);
});

afterAll(async () => {
  for (const id of [organizationId, otherOrganizationId]) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await pool.end();
});

const withRates = () => ({ organizationId, rateAccess: true });

const fixed: NewProject = {
  name: "Client portal",
  client: "Synthetic Bank",
  pricingModel: "fixed",
  priceCents: 20_000_000,
  plannedPeriod: null,
  description: null,
};

const withPeriod: NewProject = {
  ...fixed,
  plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
  description: "A portal for the bank's clients.",
};

/** The project and its pricing row, read with rate access. */
const read = (projectId: string) =>
  withOrganization(app, withRates(), async (tx) => ({
    project: await tx.select().from(projects).where(eq(projects.id, projectId)),
    pricing: await tx
      .select({ price: projectPricing.price })
      .from(projectPricing)
      .where(eq(projectPricing.projectId, projectId)),
  }));

describe("createProject", () => {
  it("creates a fixed price project with its price", async () => {
    const result = await createProject(app, withRates(), fixed);
    if (!result.ok) throw new Error("expected the project");
    const { project, pricing } = await read(result.projectId);
    expect(project).toEqual([
      {
        id: result.projectId,
        organizationId,
        name: "Client portal",
        client: "Synthetic Bank",
        pricingModel: "fixed",
        plannedStart: null,
        plannedEnd: null,
        description: null,
      },
    ]);
    expect(pricing).toEqual([{ price: 20_000_000 }]);
  });

  it("creates a project with its planned period and description", async () => {
    const result = await createProject(app, withRates(), withPeriod);
    if (!result.ok) throw new Error("expected the project");
    expect((await read(result.projectId)).project[0]).toMatchObject({
      plannedStart: "2027-04-01",
      plannedEnd: "2027-09-30",
      description: "A portal for the bank's clients.",
    });
  });

  it("leaves the price of a fixed price project without one pending", async () => {
    const result = await createProject(app, withRates(), { ...fixed, priceCents: null });
    if (!result.ok) throw new Error("expected the project");
    expect((await read(result.projectId)).pricing).toEqual([{ price: null }]);
  });

  it("creates a time and materials project without a price", async () => {
    const result = await createProject(app, withRates(), {
      ...fixed,
      pricingModel: "time_and_materials",
      priceCents: null,
    });
    if (!result.ok) throw new Error("expected the project");
    const { project, pricing } = await read(result.projectId);
    expect(project[0]?.pricingModel).toBe("time_and_materials");
    expect(pricing).toEqual([{ price: null }]);
  });

  it("shows the project, never its price, without rate access", async () => {
    const result = await createProject(app, withRates(), fixed);
    if (!result.ok) throw new Error("expected the project");
    const seen = await withOrganization(app, { organizationId, rateAccess: false }, async (tx) => ({
      project: await tx.select().from(projects).where(eq(projects.id, result.projectId)),
      pricing: await tx.select().from(projectPricing),
    }));
    expect(seen.project).toHaveLength(1);
    expect(seen.pricing).toEqual([]);
  });

  it("keeps the project inside its organization", async () => {
    const result = await createProject(app, withRates(), fixed);
    if (!result.ok) throw new Error("expected the project");
    const seen = await withOrganization(
      app,
      { organizationId: otherOrganizationId, rateAccess: true },
      (tx) => tx.select().from(projects),
    );
    expect(seen).toEqual([]);
  });

  it("refuses without rate access and writes nothing", async () => {
    const before = await withOrganization(app, withRates(), (tx) => tx.select().from(projects));
    const result = await createProject(app, { organizationId, rateAccess: false }, fixed);
    expect(result).toEqual({ ok: false, reason: "no-rate-access" });
    const after = await withOrganization(app, withRates(), (tx) => tx.select().from(projects));
    expect(after).toHaveLength(before.length);
  });
});

describe("updateProject", () => {
  const created = async (project: NewProject = fixed) => {
    const result = await createProject(app, withRates(), project);
    if (!result.ok) throw new Error("expected the project");
    return result.projectId;
  };

  it("saves every field of the form, the price in project_pricing", async () => {
    const projectId = await created();
    const result = await updateProject(app, withRates(), projectId, {
      ...withPeriod,
      name: "Client portal v2",
      priceCents: 25_000_000,
    });
    expect(result).toEqual({ ok: true });
    const { project, pricing } = await read(projectId);
    expect(project[0]).toMatchObject({
      name: "Client portal v2",
      plannedStart: "2027-04-01",
      plannedEnd: "2027-09-30",
      description: "A portal for the bank's clients.",
    });
    expect(pricing).toEqual([{ price: 25_000_000 }]);
  });

  it("prices a fixed price project that has no pricing row yet", async () => {
    const projectId = await created();
    await withOrganization(app, withRates(), (tx) =>
      tx.delete(projectPricing).where(eq(projectPricing.projectId, projectId)),
    );
    expect(await updateProject(app, withRates(), projectId, fixed)).toEqual({ ok: true });
    expect((await read(projectId)).pricing).toEqual([{ price: 20_000_000 }]);
  });

  it("clears the planned period and the description", async () => {
    const projectId = await created(withPeriod);
    await updateProject(app, withRates(), projectId, fixed);
    expect((await read(projectId)).project[0]).toMatchObject({
      plannedStart: null,
      plannedEnd: null,
      description: null,
    });
  });

  it("keeps a time and materials project's budget cap, which the form does not hold", async () => {
    const projectId = await created({ ...fixed, pricingModel: "time_and_materials" });
    await withOrganization(app, withRates(), (tx) =>
      tx
        .update(projectPricing)
        .set({ price: 5_000_000 })
        .where(eq(projectPricing.projectId, projectId)),
    );
    await updateProject(app, withRates(), projectId, {
      ...withPeriod,
      pricingModel: "time_and_materials",
      priceCents: null,
    });
    expect((await read(projectId)).pricing).toEqual([{ price: 5_000_000 }]);
  });

  it("drops a fixed price that would become a budget cap", async () => {
    const projectId = await created();
    await updateProject(app, withRates(), projectId, {
      ...fixed,
      pricingModel: "time_and_materials",
      priceCents: null,
    });
    const { project, pricing } = await read(projectId);
    expect(project[0]?.pricingModel).toBe("time_and_materials");
    expect(pricing).toEqual([{ price: null }]);
  });

  it("refuses without rate access and changes nothing", async () => {
    const projectId = await created();
    const result = await updateProject(app, { organizationId, rateAccess: false }, projectId, {
      ...withPeriod,
    });
    expect(result).toEqual({ ok: false, reason: "no-rate-access" });
    expect((await read(projectId)).project[0]?.plannedStart).toBeNull();
  });

  it("finds no project of another organization", async () => {
    const projectId = await created();
    const result = await updateProject(
      app,
      { organizationId: otherOrganizationId, rateAccess: true },
      projectId,
      withPeriod,
    );
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect((await read(projectId)).project[0]?.description).toBeNull();
  });
});
