import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProject } from "@/db/create-project";
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
      },
    ]);
    expect(pricing).toEqual([{ price: 20_000_000 }]);
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
