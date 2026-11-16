import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProject } from "@/db/create-project";
import { createScenario } from "@/db/create-scenario";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { loadScenario } from "@/db/load-scenario";
import { categories, config, costConfig, scenarios } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import { CONSULTANCY_CONFIG, CONSULTANCY_COST_CONFIG } from "@/lib/organizations/consultancy";

import { SOME_DAY, appPool, newOrganization } from "./support";

// A project's first scenario (v0.3 slice 3b): an empty team the editor opens. Scenarios are
// structural, so creating one needs no rate access (ADR 0005).

const pool = appPool(2);
const app = drizzle(pool);
let organizationId: string;
let otherOrganizationId: string;
let projectId: string;

const withRates = () => ({ organizationId, rateAccess: true });
const withoutRates = () => ({ organizationId, rateAccess: false });

beforeAll(async () => {
  organizationId = await newOrganization(pool);
  otherOrganizationId = await newOrganization(pool);
  await withOrganization(app, withRates(), async (tx) => {
    await tx.insert(config).values({ organizationId, ...CONSULTANCY_CONFIG });
    await tx.insert(costConfig).values({ organizationId, ...CONSULTANCY_COST_CONFIG });
  });
  const created = await createProject(app, withRates(), {
    name: "Client portal",
    client: "Synthetic Bank",
    pricingModel: "fixed",
    priceCents: null,
    plannedPeriod: null,
    description: null,
  });
  if (!created.ok) throw new Error("expected the project");
  projectId = created.projectId;
});

afterAll(async () => {
  for (const id of [organizationId, otherOrganizationId]) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await pool.end();
});

describe("createScenario", () => {
  it("waits for the organization's first category: a team is built from them", async () => {
    expect(await createScenario(app, withRates(), projectId, "Escenario")).toEqual({
      ok: false,
      reason: "no-categories",
    });
    await withOrganization(app, withRates(), (tx) =>
      tx.insert(categories).values({ organizationId, name: "Senior Developer" }),
    );
  });

  it("creates a project's scenario, numbered after the ones it has, that the editor opens empty", async () => {
    const first = await createScenario(app, withoutRates(), projectId, "Escenario");
    if (!first.ok) throw new Error("expected the scenario");
    const second = await createScenario(app, withRates(), projectId, "Escenario");
    if (!second.ok) throw new Error("expected the scenario");

    const rows = await withOrganization(app, withRates(), (tx) =>
      tx
        .select({ id: scenarios.id, name: scenarios.name, chosen: scenarios.chosen })
        .from(scenarios),
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: first.scenarioId, name: "Escenario 1", chosen: false },
        { id: second.scenarioId, name: "Escenario 2", chosen: false },
      ]),
    );
    const loaded = await loadScenario(app, withRates(), first.scenarioId, SOME_DAY);
    expect(loaded?.editing.team).toEqual([]);
  });

  it("finds no project of another organization", async () => {
    expect(
      await createScenario(
        app,
        { organizationId: otherOrganizationId, rateAccess: true },
        projectId,
        "Escenario",
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });
});
