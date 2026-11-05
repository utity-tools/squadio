import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memberAccessContext } from "@/db/access";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadPortfolio, loadProject } from "@/db/load-portfolio";
import { memberProjectContext } from "@/db/project-context";
import { loadScenario } from "@/db/load-scenario";
import type { AccessContext } from "@/db/tenant";
import { categoryOccupancy } from "@/lib/bench/category-occupancy";
import { capabilitiesFor } from "@/lib/membership/capabilities";
import { corrections } from "@/lib/portfolio/corrections";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization } from "./support";

// docs/domain.md, "The organization at a glance", on the demo organization's seed.

const pool = appPool(2);
const app = drizzle(pool);

const withRates: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
const withoutRates: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: false };

const owner = capabilitiesFor("owner");
if (!owner) throw new Error("expected the owner's capabilities");

let copy: string;
let other: string;
let empty: string;

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  copy = await newOrganization(app);
  other = await newOrganization(app);
  empty = await newOrganization(app);
  for (const organizationId of [copy, other]) {
    await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
  }
});

// Like the other database tests, the synthetic organizations stay: each run makes new ones.
afterAll(async () => {
  await pool.end();
});

describe("loadPortfolio", () => {
  it("lists every project in name order, with its client, pricing model and scenarios", async () => {
    const portfolio = await loadPortfolio(app, withRates, SOME_DAY);

    expect(
      portfolio.projects.map(({ name, client, pricingModel, scenarios }) => [
        name,
        client,
        pricingModel,
        scenarios.map((scenario) => `${scenario.name}${scenario.chosen ? " (chosen)" : ""}`),
      ]),
    ).toEqual([
      ["Customer portal", "Demo Client", "fixed", ["Plan A", "Plan B"]],
      ["Internal tooling", "Demo Client", "fixed", ["First draft"]],
      ["Mobile app", "Demo Retail", "time_and_materials", ["Delivery plan (chosen)"]],
      ["Platform upkeep", "Demo Client", "time_and_materials", ["Run plan (chosen)"]],
      ["Support retainer", "Demo Client", "time_and_materials", ["Data platform", "Over budget"]],
    ]);
  });

  it("costs every scenario as the scenario page does, frozen values included", async () => {
    const portfolio = await loadPortfolio(app, withRates, SOME_DAY);

    for (const scenario of portfolio.projects.flatMap((project) => project.scenarios)) {
      const page = await loadScenario(app, withRates, scenario.id, SOME_DAY);
      if (!page?.rateAccess) throw new Error(`expected ${scenario.name} with rate access`);
      expect(scenario.money).toEqual({
        netMarginCents: page.result.netMarginCents,
        netMarginBasisPoints: page.result.netMarginBasisPoints,
        marginStatus: page.result.marginStatus,
        warnings: page.result.warnings,
      });
      expect(scenario.effectiveHours).toBe(page.result.hours.effective);
      expect(scenario.people).toBe(page.team.filter((member) => member.person).length);
      expect(scenario.openRoles).toBe(page.team.filter((member) => !member.person).length);
    }
  });

  it("gives each project its price or cap, and none to a fixed price still to agree", async () => {
    const portfolio = await loadPortfolio(app, withRates, SOME_DAY);
    const price = (name: string) => portfolio.projects.find((p) => p.name === name)?.price;

    expect(price("Customer portal")).toEqual({ cents: 20_000_000 });
    expect(price("Support retainer")).toEqual({ cents: 5_000_000 });
    expect(price("Internal tooling")).toEqual({ cents: null });
  });

  it("gathers the demo's corrections once per missing input", async () => {
    const found = corrections(await loadPortfolio(app, withRates, SOME_DAY));

    expect(
      found.map((correction) => [
        correction.kind,
        "category" in correction ? correction.category.name : correction.project.name,
        `${correction.first.project.name} › ${correction.first.name}`,
        correction.more,
      ]),
    ).toEqual([
      ["missingCost", "Data Engineer", "Support retainer › Data platform", 0],
      ["missingSellRate", "Data Engineer", "Support retainer › Data platform", 0],
      ["missingPrice", "Internal tooling", "Internal tooling › First draft", 0],
      ["budgetCapExceeded", "Support retainer", "Support retainer › Over budget", 0],
    ]);
  });

  it("measures occupancy by category from the bench's people, today", async () => {
    const portfolio = await loadPortfolio(app, withRates, SOME_DAY);
    const page = await loadScenario(app, withRates, DEMO_IDS.guideScenario, SOME_DAY);
    if (!page) throw new Error("expected the guide scenario");
    const { categories, people } = page.editing.basis;
    const busy = new Map(people.map((person) => [person.id, person.occupancy]));

    expect(portfolio.occupancy).toEqual(categoryOccupancy(categories, people, busy));
    expect(portfolio.occupancy.some((line) => line.percent > 0)).toBe(true);
    // Data Engineer has nobody, so it has no occupancy to show.
    expect(portfolio.occupancy.map((line) => line.category.name)).not.toContain("Data Engineer");
    expect(portfolio.activePeople).toBe(people.filter((person) => person.active).length);
  });

  it("reads no money without rate access, and the same structure, hours and occupancy", async () => {
    const full = await loadPortfolio(app, withRates, SOME_DAY);
    const open = await loadPortfolio(app, withoutRates, SOME_DAY);

    expect(open.rateAccess).toBe(false);
    for (const project of open.projects) {
      expect(project.price).toBeNull();
      for (const scenario of project.scenarios) expect(scenario.money).toBeNull();
    }
    expect(JSON.stringify(open)).not.toMatch(/Cents|BasisPoints|warnings/);
    // Everything but the money is the same.
    const strip = (portfolio: typeof full) =>
      portfolio.projects.map((project) => ({
        name: project.name,
        scenarios: project.scenarios.map((scenario) => ({
          id: scenario.id,
          chosen: scenario.chosen,
          people: scenario.people,
          openRoles: scenario.openRoles,
          effectiveHours: scenario.effectiveHours,
        })),
      }));
    expect(strip(open)).toEqual(strip(full));
    expect(open.occupancy).toEqual(full.occupancy);
    expect(open.activePeople).toBe(full.activePeople);
  });

  it("shows a member their own organization only", async () => {
    const context = memberAccessContext({ organizationId: copy, capabilities: owner });
    const portfolio = await loadPortfolio(app, context, SOME_DAY);
    const ids = portfolio.projects.flatMap((project) => [
      project.id,
      ...project.scenarios.map((scenario) => scenario.id),
    ]);

    expect(ids).toContain(copyId(DEMO_IDS.project, copy));
    expect(ids).toContain(copyId(DEMO_IDS.guideScenario, copy));
    expect(ids).not.toContain(DEMO_IDS.guideScenario);
    expect(ids).not.toContain(copyId(DEMO_IDS.guideScenario, other));
    expect(portfolio.projects).toHaveLength(5);
  });

  it("hides money from a member's page without rate access", async () => {
    const context = memberAccessContext(
      { organizationId: copy, capabilities: owner },
      { access: "none" },
    );
    const portfolio = await loadPortfolio(app, context, SOME_DAY);

    expect(portfolio.rateAccess).toBe(false);
    expect(JSON.stringify(portfolio)).not.toMatch(/Cents|BasisPoints|warnings/);
  });

  it("shows an empty organization with nothing in it", async () => {
    const portfolio = await loadPortfolio(
      app,
      { organizationId: empty, rateAccess: true },
      SOME_DAY,
    );

    expect(portfolio).toEqual({
      rateAccess: true,
      projects: [],
      categories: [],
      activePeople: 0,
      occupancy: [],
    });
  });

  it("refuses a day that is not a date", async () => {
    await expect(loadPortfolio(app, withRates, "today")).rejects.toThrow();
  });
});

describe("loadProject", () => {
  it("gives one project as the portfolio gives it", async () => {
    const portfolio = await loadPortfolio(app, withRates, SOME_DAY);
    const loaded = await loadProject(app, withRates, DEMO_IDS.project, SOME_DAY);

    expect(loaded?.project).toEqual(portfolio.projects.find((p) => p.id === DEMO_IDS.project));
    expect(loaded?.project.scenarios.map((scenario) => scenario.name)).toEqual([
      "Plan A",
      "Plan B",
    ]);
    expect(loaded?.categories).toEqual(portfolio.categories);
  });

  it("gives no price and no money without rate access", async () => {
    const loaded = await loadProject(app, withoutRates, DEMO_IDS.project, SOME_DAY);

    expect(loaded?.project.price).toBeNull();
    expect(loaded?.project.scenarios.every((scenario) => scenario.money === null)).toBe(true);
  });

  it("finds no project of another organization, or that does not exist", async () => {
    const context = memberAccessContext({ organizationId: copy, capabilities: owner });

    expect(await loadProject(app, context, DEMO_IDS.project, SOME_DAY)).toBeNull();
    expect(await loadProject(app, context, copyId(DEMO_IDS.project, other), SOME_DAY)).toBeNull();
    expect(
      await loadProject(app, context, copyId(DEMO_IDS.project, copy), SOME_DAY),
    ).not.toBeNull();
  });

  it("refuses an id that is not a UUID", async () => {
    await expect(loadProject(app, withRates, "portal", SOME_DAY)).rejects.toThrow();
  });
});

describe("memberProjectContext", () => {
  const member = () => ({ organizationId: copy, capabilities: owner });

  it("gives a member their own context for a project their organization holds", async () => {
    const id = copyId(DEMO_IDS.project, copy);

    expect(await memberProjectContext(app, member(), id)).toEqual({
      organizationId: copy,
      rateAccess: true,
    });
    expect(await memberProjectContext(app, member(), id, { access: "none" })).toEqual({
      organizationId: copy,
      rateAccess: false,
    });
  });

  it("gives none for the demo, another organization's project or an id that is not a UUID", async () => {
    expect(await memberProjectContext(app, member(), DEMO_IDS.project)).toBeNull();
    expect(await memberProjectContext(app, member(), copyId(DEMO_IDS.project, other))).toBeNull();
    expect(await memberProjectContext(app, member(), "portal")).toBeNull();
    expect(await memberProjectContext(app, null, copyId(DEMO_IDS.project, copy))).toBeNull();
  });
});
