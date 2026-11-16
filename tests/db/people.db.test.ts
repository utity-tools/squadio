import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { createPerson, loadPeople, updatePerson } from "@/db/people";
import {
  assignments,
  categories,
  categoryRates,
  config,
  people,
  projects,
  scenarios,
} from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import type { PersonForm } from "@/lib/people/person-form";

import { SOME_DAY, appPool, newOrganization } from "./support";

// A person is structural (ADR 0005): everyone in the organization reads them. Writing one moves
// rule j's count, which only users with rate access see, so the app asks for rate access to write.

const pool = appPool(2);
const app = drizzle(pool);
let organizationId: string;
let otherOrganizationId: string;
let devOps: string;
let pm: string;
let otherCategory: string;

const withRates = () => ({ organizationId, rateAccess: true });
const withoutRates = () => ({ organizationId, rateAccess: false });

beforeAll(async () => {
  organizationId = await newOrganization(pool);
  otherOrganizationId = await newOrganization(pool);
  devOps = randomUUID();
  pm = randomUUID();
  otherCategory = randomUUID();
  await withOrganization(app, withRates(), async (tx) => {
    await tx
      .insert(config)
      .values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 37.5 });
    await tx.insert(categories).values([
      { id: devOps, organizationId, name: "DevOps Engineer" },
      { id: pm, organizationId, name: "Project Manager" },
    ]);
    // Only the project manager has a rate: DevOps is pending (rule k).
    await tx.insert(categoryRates).values({
      organizationId,
      categoryId: pm,
      grossAnnualSalary: 6_000_000,
      socialSecurity: 3100,
      otherYearlyCosts: 300_000,
      sellRate: 8000,
    });
  });
  await withOrganization(app, { organizationId: otherOrganizationId, rateAccess: true }, (tx) =>
    tx
      .insert(categories)
      .values({ id: otherCategory, organizationId: otherOrganizationId, name: "Other" }),
  );
});

afterAll(async () => {
  for (const id of [organizationId, otherOrganizationId]) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await pool.end();
});

let names = 0;
const pablo = (overrides: Partial<PersonForm> = {}): PersonForm => ({
  name: `Pablo Ruiz ${(names += 1)}`,
  categoryId: devOps,
  weeklyHours: 40,
  area: "Plataforma",
  active: true,
  ...overrides,
});

const created = async (form: PersonForm = pablo()) => {
  const result = await createPerson(app, withRates(), form);
  if (!result.ok) throw new Error(`expected the person, got ${result.reason}`);
  return result.personId;
};

const readPeople = () => withOrganization(app, withoutRates(), (tx) => tx.select().from(people));

describe("createPerson", () => {
  it("creates a person of the organization", async () => {
    const form = pablo({ weeklyHours: 37.5 });
    const personId = await created(form);
    expect(await readPeople()).toContainEqual({ id: personId, organizationId, ...form });
  });

  it("lets two people share a name", async () => {
    const form = pablo();
    await created(form);
    expect((await createPerson(app, withRates(), form)).ok).toBe(true);
  });

  it("refuses without rate access and writes nothing", async () => {
    const form = pablo();
    expect(await createPerson(app, withoutRates(), form)).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect((await readPeople()).map((row) => row.name)).not.toContain(form.name);
  });

  it("refuses another organization's category", async () => {
    const form = pablo({ categoryId: otherCategory });
    expect(await createPerson(app, withRates(), form)).toEqual({
      ok: false,
      reason: "category-not-found",
    });
    expect((await readPeople()).map((row) => row.name)).not.toContain(form.name);
  });
});

describe("updatePerson", () => {
  it("changes every field of a person", async () => {
    const personId = await created();
    const form = pablo({ categoryId: pm, weeklyHours: 20, area: null, active: false });
    expect(await updatePerson(app, withRates(), personId, form)).toEqual({ ok: true });
    expect(await readPeople()).toContainEqual({ id: personId, organizationId, ...form });
  });

  it("refuses without rate access and changes nothing", async () => {
    const form = pablo();
    const personId = await created(form);
    expect(await updatePerson(app, withoutRates(), personId, pablo({ active: false }))).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(await readPeople()).toContainEqual({ id: personId, organizationId, ...form });
  });

  it("does not find another organization's person", async () => {
    const outsider = await withOrganization(
      app,
      { organizationId: otherOrganizationId, rateAccess: true },
      async (tx) => {
        const [row] = await tx
          .insert(people)
          .values({
            organizationId: otherOrganizationId,
            name: "Someone else",
            categoryId: otherCategory,
            weeklyHours: 40,
          })
          .returning({ id: people.id });
        return row?.id ?? "";
      },
    );
    expect(await updatePerson(app, withRates(), outsider, pablo())).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses to move a person to another organization's category", async () => {
    const personId = await created();
    expect(
      await updatePerson(app, withRates(), personId, pablo({ categoryId: otherCategory })),
    ).toEqual({ ok: false, reason: "category-not-found" });
  });
});

describe("loadPeople", () => {
  it("reads the organization's people by name with how busy each is today", async () => {
    const busy = await created(pablo({ name: "Ana Busy" }));
    const projectId = randomUUID();
    const scenarioId = randomUUID();
    await withOrganization(app, withoutRates(), async (tx) => {
      await tx
        .insert(projects)
        .values({ id: projectId, organizationId, name: "P", client: "C", pricingModel: "fixed" });
      await tx
        .insert(scenarios)
        .values({ id: scenarioId, organizationId, projectId, name: "S", chosen: true });
      await tx.insert(assignments).values({
        organizationId,
        scenarioId,
        categoryId: devOps,
        personId: busy,
        projectRole: "DevOps",
        weeklyHours: 40,
        allocation: 60,
        startDate: SOME_DAY,
        endDate: SOME_DAY,
      });
    });

    const loaded = await loadPeople(app, withoutRates(), SOME_DAY);
    expect(loaded.defaultWeeklyHours).toBe(37.5);
    expect(loaded.categories).toEqual([
      { id: devOps, name: "DevOps Engineer" },
      { id: pm, name: "Project Manager" },
    ]);
    expect(loaded.people[0]).toMatchObject({ id: busy, name: "Ana Busy", occupancy: 60 });
    expect(loaded.people.slice(1).every((person) => person.occupancy === 0)).toBe(true);
  });

  it("hides which categories are pending and which are small without rate access", async () => {
    const loaded = await loadPeople(app, withoutRates(), SOME_DAY);
    expect(loaded.rates).toBeNull();
  });

  it("with rate access, says which categories lack a rate and which are small", async () => {
    const loaded = await loadPeople(app, withRates(), SOME_DAY);
    expect(loaded.rates?.pending).toEqual([devOps]);
    const activePm = loaded.people.filter((p) => p.categoryId === pm && p.active).length;
    const small = loaded.rates?.small.map((category) => category.categoryId) ?? [];
    expect(small.includes(pm)).toBe(activePm === 1 || activePm === 2);
  });
});
