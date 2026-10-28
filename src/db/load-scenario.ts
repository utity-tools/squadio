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
import { findSmallCategories } from "@/lib/rates/small-categories";
import type { Member } from "@/lib/scenarios/change";
import { type StoredScenario, toEngineInput, toHoursInput } from "@/lib/scenarios/engine-input";
import {
  type LoadedScenario,
  type ScenarioBasis,
  scenarioView,
} from "@/lib/scenarios/scenario-view";

import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Loading a scenario". The view comes from `scenarioView`, the function the page
// runs again on every change, over a basis that holds everything but the team.

/** A loaded scenario, with what the page needs to edit it: its basis, team and version. */
export type EditableScenario = LoadedScenario & {
  editing: { basis: ScenarioBasis; team: Member[]; version: number };
};

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
      version: scenarios.version,
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
  const team: Member[] = await tx
    .select({
      id: assignments.id,
      projectRole: assignments.projectRole,
      categoryId: assignments.categoryId,
      personId: assignments.personId,
      reportsTo: assignments.reportsTo,
      weeklyHours: assignments.weeklyHours,
      allocation: assignments.allocation,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
    })
    .from(assignments)
    .where(eq(assignments.scenarioId, scenarioId))
    .orderBy(assignments.startDate, assignments.id);
  const roster = await tx
    .select({
      id: people.id,
      name: people.name,
      categoryId: people.categoryId,
      weeklyHours: people.weeklyHours,
      active: people.active,
    })
    .from(people)
    .orderBy(people.name, people.id);
  const categoryNames = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(categories.name, categories.id);
  return { ...scenario, config: settings, team, roster, categories: categoryNames };
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
 * A scenario's view with the organization's current values, and what the page needs to edit it,
 * or null when the scenario is not in the organization. Without rate access the open part and its
 * hours only: never a money figure, in the view or the basis.
 */
export async function loadScenario(
  db: NodePgDatabase,
  context: AccessContext,
  scenarioIdInput: string,
): Promise<EditableScenario | null> {
  const scenarioId = z.uuid().parse(scenarioIdInput);
  return withOrganization(db, context, async (tx) => {
    const structure = await readStructure(tx, scenarioId);
    if (!structure) return null;
    const { projectId, pricingModel, config: settings, team } = structure;
    // The engine's inputs without a team: `scenarioView` adds it, and its year's calendar.
    const structural = { pricingModel, config: settings, assignments: [] };

    let engine: ScenarioBasis["engine"];
    if (!context.rateAccess) {
      const stored: StoredScenario = { ...structural, extraCosts: [], rates: [] };
      engine = { rateAccess: false, input: toHoursInput(stored) };
    } else {
      const money = await readMoney(tx, scenarioId, projectId);
      engine = {
        rateAccess: true,
        input: toEngineInput({ ...structural, ...money }),
        smallCategories: findSmallCategories(structure.roster),
        extraCosts: money.extraCosts.map(({ id, label, kind }) => ({ id, label, kind })),
      };
    }
    const basis: ScenarioBasis = {
      project: { name: structure.project, client: structure.client, pricingModel },
      scenario: { name: structure.name, chosen: structure.chosen },
      categories: structure.categories,
      people: structure.roster,
      defaultWeeklyHours: settings.defaultWeeklyHours,
      engine,
    };
    return {
      ...scenarioView(basis, team),
      editing: { basis, team, version: structure.version },
    };
  });
}
