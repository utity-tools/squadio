import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  assignments,
  categories,
  categoryRates,
  config,
  costConfig,
  extraCosts,
  people,
  projectPricing,
  projects,
  scenarios,
} from "./schema";
import { DEMO_ORGANIZATION_ID, demoAccessContext } from "./access";
import { type TenantTransaction, withOrganization } from "./tenant";

// The demo organization: the Consultancy template and the guide case team of docs/domain.md, plus
// one scenario per summary warning, with synthetic people only. Fixed ids, so links to the demo
// keep working after a reseed.

export { DEMO_ORGANIZATION_ID };

const DEMO = demoAccessContext;

const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_IDS = {
  project: demoId(100),
  guideScenario: demoId(200),
  leanScenario: demoId(201),
  /** Plan A's seats and its cloud cost. */
  guide: {
    manager: demoId(300),
    senior: demoId(301),
    frontend: demoId(302),
    devops: demoId(303),
    cloud: demoId(400),
  },
  /** A time and materials project whose budget cap is below its revenue. */
  overBudgetScenario: demoId(202),
  /** Uses a category without a rate. */
  missingRateScenario: demoId(203),
  /** A fixed-price project without a price. */
  missingPriceScenario: demoId(204),
} as const;

/** The Consultancy template: gross annual salary and sell rate per hour, in cents. */
const TEMPLATE = [
  { key: "senior", name: "Senior Developer", gross: 5_200_000, sell: 6500, people: 4 },
  { key: "junior", name: "Junior Developer", gross: 2_700_000, sell: 3500, people: 3 },
  { key: "frontend", name: "Frontend Developer", gross: 4_200_000, sell: 5200, people: 3 },
  { key: "devops", name: "DevOps Engineer", gross: 5_000_000, sell: 6200, people: 2 },
  { key: "pm", name: "Project Manager", gross: 5_500_000, sell: 7000, people: 3 },
] as const;

/** A category without a rate or people, so a scenario that uses it has no cost (rule k). */
const UNRATED_CATEGORY = { id: demoId(15), name: "Data Engineer" };

type CategoryKey = (typeof TEMPLATE)[number]["key"];

const categoryId = (key: CategoryKey) => demoId(10 + TEMPLATE.findIndex((c) => c.key === key));
const personId = (key: CategoryKey, n: number) =>
  demoId(1000 + 100 * TEMPLATE.findIndex((c) => c.key === key) + n);

/** Deletes every row of the demo organization, children first. */
async function clear(tx: TenantTransaction) {
  // Projects cascade to their pricing, scenarios, assignments and extra costs.
  await tx.delete(projects);
  await tx.delete(people);
  // Categories cascade to their rates.
  await tx.delete(categories);
  await tx.delete(costConfig);
  await tx.delete(config);
}

async function insert(tx: TenantTransaction) {
  const organizationId = DEMO_ORGANIZATION_ID;
  await tx.insert(config).values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 });
  await tx
    .insert(costConfig)
    .values({ organizationId, overhead: 1500, buffer: 1000, targetMargin: 2500 });

  await tx
    .insert(categories)
    .values([
      ...TEMPLATE.map(({ key, name }) => ({ id: categoryId(key), organizationId, name })),
      { ...UNRATED_CATEGORY, organizationId },
    ]);
  await tx.insert(categoryRates).values(
    TEMPLATE.map(({ key, gross, sell }) => ({
      organizationId,
      categoryId: categoryId(key),
      grossAnnualSalary: gross,
      socialSecurity: 3100,
      otherYearlyCosts: 300_000,
      sellRate: sell,
    })),
  );
  await tx.insert(people).values(
    TEMPLATE.flatMap(({ key, name, people: count }) =>
      Array.from({ length: count }, (_, n) => ({
        id: personId(key, n),
        organizationId,
        name: `${name} ${n + 1}`,
        categoryId: categoryId(key),
        weeklyHours: 40,
      })),
    ),
  );

  await tx.insert(projects).values({
    id: DEMO_IDS.project,
    organizationId,
    name: "Customer portal",
    client: "Demo Client",
    pricingModel: "fixed",
  });
  await tx
    .insert(projectPricing)
    .values({ organizationId, projectId: DEMO_IDS.project, price: 20_000_000 });
  await tx.insert(scenarios).values([
    { id: DEMO_IDS.guideScenario, organizationId, projectId: DEMO_IDS.project, name: "Plan A" },
    { id: DEMO_IDS.leanScenario, organizationId, projectId: DEMO_IDS.project, name: "Plan B" },
  ]);

  const seat = {
    organizationId,
    weeklyHours: 40,
    startDate: "2027-04-01",
    endDate: "2027-09-29",
  };
  // Plan A is the guide case team: senior and frontend full time, DevOps and the PM at half.
  const lead = DEMO_IDS.guide.manager;
  await tx.insert(assignments).values([
    {
      ...seat,
      id: lead,
      scenarioId: DEMO_IDS.guideScenario,
      categoryId: categoryId("pm"),
      personId: personId("pm", 0),
      projectRole: "Project manager",
      allocation: 50,
    },
    {
      ...seat,
      id: DEMO_IDS.guide.senior,
      scenarioId: DEMO_IDS.guideScenario,
      categoryId: categoryId("senior"),
      personId: personId("senior", 0),
      projectRole: "Tech lead",
      reportsTo: lead,
      allocation: 100,
    },
    {
      ...seat,
      id: DEMO_IDS.guide.frontend,
      scenarioId: DEMO_IDS.guideScenario,
      categoryId: categoryId("frontend"),
      personId: personId("frontend", 0),
      projectRole: "Frontend developer",
      reportsTo: lead,
      allocation: 100,
    },
    {
      ...seat,
      id: DEMO_IDS.guide.devops,
      scenarioId: DEMO_IDS.guideScenario,
      categoryId: categoryId("devops"),
      projectRole: "DevOps engineer",
      reportsTo: lead,
      allocation: 50,
    },
  ]);
  // Plan B swaps the senior for a junior and drops DevOps: cheaper, with the same price.
  const leanLead = demoId(310);
  await tx.insert(assignments).values([
    {
      ...seat,
      id: leanLead,
      scenarioId: DEMO_IDS.leanScenario,
      categoryId: categoryId("pm"),
      personId: personId("pm", 1),
      projectRole: "Project manager",
      allocation: 50,
    },
    {
      ...seat,
      id: demoId(311),
      scenarioId: DEMO_IDS.leanScenario,
      categoryId: categoryId("junior"),
      personId: personId("junior", 0),
      projectRole: "Developer",
      reportsTo: leanLead,
      allocation: 100,
    },
    {
      ...seat,
      id: demoId(312),
      scenarioId: DEMO_IDS.leanScenario,
      categoryId: categoryId("frontend"),
      personId: personId("frontend", 1),
      projectRole: "Frontend developer",
      reportsTo: leanLead,
      allocation: 100,
    },
  ]);
  await tx.insert(extraCosts).values([
    {
      id: DEMO_IDS.guide.cloud,
      organizationId,
      scenarioId: DEMO_IDS.guideScenario,
      label: "Cloud",
      kind: "recurring",
      amount: 100_000,
    },
    {
      id: demoId(401),
      organizationId,
      scenarioId: DEMO_IDS.leanScenario,
      label: "Cloud",
      kind: "recurring",
      amount: 100_000,
    },
  ]);

  await insertWarningScenarios(tx);
}

/** One scenario per summary warning, in projects of their own so Plan A's figures stay put. */
async function insertWarningScenarios(tx: TenantTransaction) {
  const organizationId = DEMO_ORGANIZATION_ID;
  const retainer = demoId(101);
  const tooling = demoId(102);
  await tx.insert(projects).values([
    {
      id: retainer,
      organizationId,
      name: "Support retainer",
      client: "Demo Client",
      pricingModel: "time_and_materials",
    },
    // Fixed price with no project_pricing row: the price is still to be agreed.
    {
      id: tooling,
      organizationId,
      name: "Internal tooling",
      client: "Demo Client",
      pricingModel: "fixed",
    },
  ]);
  // About 793 effective hours of a senior at €65/h bill €51,565, above the €50,000 cap.
  await tx.insert(projectPricing).values({ organizationId, projectId: retainer, price: 5_000_000 });
  await tx.insert(scenarios).values([
    {
      id: DEMO_IDS.overBudgetScenario,
      organizationId,
      projectId: retainer,
      name: "Over budget",
    },
    {
      id: DEMO_IDS.missingRateScenario,
      organizationId,
      projectId: retainer,
      name: "Data platform",
    },
    {
      id: DEMO_IDS.missingPriceScenario,
      organizationId,
      projectId: tooling,
      name: "First draft",
    },
  ]);

  const seat = {
    organizationId,
    weeklyHours: 40,
    startDate: "2027-04-01",
    endDate: "2027-09-29",
    allocation: 100,
  };
  const dataLead = demoId(330);
  await tx.insert(assignments).values([
    {
      ...seat,
      id: demoId(320),
      scenarioId: DEMO_IDS.overBudgetScenario,
      categoryId: categoryId("senior"),
      personId: personId("senior", 1),
      projectRole: "Support engineer",
    },
    {
      ...seat,
      id: dataLead,
      scenarioId: DEMO_IDS.missingRateScenario,
      categoryId: categoryId("senior"),
      personId: personId("senior", 2),
      projectRole: "Tech lead",
    },
    {
      ...seat,
      id: demoId(331),
      scenarioId: DEMO_IDS.missingRateScenario,
      categoryId: UNRATED_CATEGORY.id,
      projectRole: "Data engineer",
      reportsTo: dataLead,
      allocation: 50,
    },
    {
      ...seat,
      id: demoId(340),
      scenarioId: DEMO_IDS.missingPriceScenario,
      categoryId: categoryId("junior"),
      personId: personId("junior", 1),
      projectRole: "Developer",
    },
  ]);
}

/**
 * Replaces the demo organization's data with the seed, in one transaction with rate access: a
 * reseed leaves the same rows, and a failure leaves the previous ones. Touches no other
 * organization, since Row Level Security scopes every statement (ADR 0004).
 */
export async function seedDemo(db: NodePgDatabase): Promise<void> {
  await withOrganization(db, DEMO, async (tx) => {
    await clear(tx);
    await insert(tx);
  });
}
