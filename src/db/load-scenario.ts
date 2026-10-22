import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

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
import { type ScenarioResult, calculateScenario } from "@/lib/costing/calculate-scenario";
import { type SmallCategory, findSmallCategories } from "@/lib/rates/small-categories";
import { type ProjectSpan, projectSpan } from "@/lib/scenarios/project-span";

import {
  type EngineInput,
  type StoredScenario,
  toEngineInput,
  toHoursInput,
} from "@/lib/scenarios/engine-input";

import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Loading a scenario".

/**
 * An assignment as everyone sees it: structure and names, never money. No person: an open role.
 * It names people, so it is never an AI payload (ADR 0003).
 */
export type TeamAssignment = {
  id: string;
  projectRole: string;
  category: { id: string; name: string };
  person: { id: string; name: string } | null;
  reportsTo: string | null;
  weeklyHours: number;
  allocation: number;
  startDate: string;
  endDate: string;
};

/** The open part: what everyone gets, read only from tables without money (ADR 0005). */
export type OpenScenario = {
  project: { name: string; client: string; pricingModel: StoredScenario["pricingModel"] };
  scenario: { name: string; chosen: boolean };
  team: TeamAssignment[];
  span: ProjectSpan | null;
};

export type LoadedScenario = OpenScenario &
  (
    | { rateAccess: true; result: ScenarioResult; smallCategories: SmallCategory[] }
    | {
        rateAccess: false;
        hours: ScenarioResult["hours"];
        assignments: ScenarioResult["assignments"];
      }
  );

const run = ({ scenario, rates, costSettings, targetMargin }: EngineInput) =>
  calculateScenario(scenario, rates, costSettings, targetMargin);

/** The rows everyone reads; undefined when the scenario is not in the organization. */
async function readStructure(tx: TenantTransaction, scenarioId: string) {
  const [scenario] = await tx
    .select({
      projectId: projects.id,
      project: projects.name,
      client: projects.client,
      pricingModel: projects.pricingModel,
      name: scenarios.name,
      chosen: scenarios.chosen,
    })
    .from(scenarios)
    .innerJoin(projects, eq(projects.id, scenarios.projectId))
    .where(eq(scenarios.id, scenarioId));
  if (!scenario) return undefined;
  const [settings] = await tx
    .select({
      netAnnualHours: config.netAnnualHours,
      defaultWeeklyHours: config.defaultWeeklyHours,
    })
    .from(config);
  if (!settings) throw new Error("The organization has no config");
  const team = await tx
    .select({
      id: assignments.id,
      projectRole: assignments.projectRole,
      categoryId: assignments.categoryId,
      categoryName: categories.name,
      personId: people.id,
      personName: people.name,
      reportsTo: assignments.reportsTo,
      weeklyHours: assignments.weeklyHours,
      allocation: assignments.allocation,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
    })
    .from(assignments)
    .innerJoin(categories, eq(categories.id, assignments.categoryId))
    .leftJoin(people, eq(people.id, assignments.personId))
    .where(eq(assignments.scenarioId, scenarioId))
    .orderBy(assignments.startDate, assignments.id);
  return { ...scenario, config: settings, team };
}

type Structure = NonNullable<Awaited<ReturnType<typeof readStructure>>>;

/** The engine's view of the team: no names. */
const toStoredAssignments = (team: Structure["team"]): StoredScenario["assignments"] =>
  team.map(({ id, categoryId, reportsTo, weeklyHours, allocation, startDate, endDate }) => ({
    id,
    categoryId,
    reportsTo,
    weeklyHours,
    allocation,
    startDate,
    endDate,
  }));

/** Runs after the engine, so a date outside the calendar fails there first, on its field. */
function toOpenScenario(structure: Structure): OpenScenario {
  const { project, client, pricingModel, name, chosen, team } = structure;
  return {
    project: { name: project, client, pricingModel },
    scenario: { name, chosen },
    team: team.map(({ categoryId, categoryName, personId, personName, ...member }) => ({
      ...member,
      category: { id: categoryId, name: categoryName },
      person: personId === null || personName === null ? null : { id: personId, name: personName },
    })),
    span: projectSpan(team),
  };
}

/** The restricted rows: none without rate access (ADR 0005). */
async function readMoney(tx: TenantTransaction, scenarioId: string, projectId: string) {
  const [organizationCosts] = await tx
    .select({
      overhead: costConfig.overhead,
      buffer: costConfig.buffer,
      targetMargin: costConfig.targetMargin,
    })
    .from(costConfig);
  const [pricing] = await tx
    .select({
      price: projectPricing.price,
      overhead: projectPricing.overhead,
      buffer: projectPricing.buffer,
    })
    .from(projectPricing)
    .where(eq(projectPricing.projectId, projectId));
  const extras = await tx
    .select({
      id: extraCosts.id,
      label: extraCosts.label,
      kind: extraCosts.kind,
      amount: extraCosts.amount,
      percentage: extraCosts.percentage,
      base: extraCosts.base,
      startDate: extraCosts.startDate,
      endDate: extraCosts.endDate,
    })
    .from(extraCosts)
    .where(eq(extraCosts.scenarioId, scenarioId))
    .orderBy(extraCosts.id);
  const rates = await tx
    .select({
      categoryId: categoryRates.categoryId,
      grossAnnualSalaryCents: categoryRates.grossAnnualSalary,
      socialSecurityBasisPoints: categoryRates.socialSecurity,
      otherYearlyCostsCents: categoryRates.otherYearlyCosts,
      manualCostPerHourCents: categoryRates.manualCostPerHour,
      sellRateCents: categoryRates.sellRate,
    })
    .from(categoryRates);
  return { costConfig: organizationCosts, pricing, extraCosts: extras, rates };
}

/**
 * A scenario's open part and result with the organization's current values, or null when the
 * scenario is not in the organization. Without rate access the open part and its hours only:
 * never a money figure.
 */
export async function loadScenario(
  db: NodePgDatabase,
  context: AccessContext,
  scenarioIdInput: string,
): Promise<LoadedScenario | null> {
  const scenarioId = z.uuid().parse(scenarioIdInput);
  return withOrganization(db, context, async (tx) => {
    const structure = await readStructure(tx, scenarioId);
    if (!structure) return null;
    const { projectId, pricingModel, config: settings } = structure;
    const structural = {
      pricingModel,
      config: settings,
      assignments: toStoredAssignments(structure.team),
    };

    if (!context.rateAccess) {
      const stored: StoredScenario = { ...structural, extraCosts: [], rates: [] };
      const { hours, assignments: perAssignment } = run(toHoursInput(stored));
      return { ...toOpenScenario(structure), rateAccess: false, hours, assignments: perAssignment };
    }

    const money = await readMoney(tx, scenarioId, projectId);
    const result = run(toEngineInput({ ...structural, ...money }));
    const headcount = await tx
      .select({ id: people.id, categoryId: people.categoryId, active: people.active })
      .from(people);
    const used = new Set(structural.assignments.map((assignment) => assignment.categoryId));
    const smallCategories = findSmallCategories(headcount).filter((small) =>
      used.has(small.categoryId),
    );
    return { ...toOpenScenario(structure), rateAccess: true, result, smallCategories };
  });
}
