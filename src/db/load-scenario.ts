import { and, eq, gt, gte, isNotNull, lte, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import {
  assignments,
  categories,
  categoryRates,
  config,
  costConfig,
  extraCosts,
  frozenCostConfig,
  frozenRates,
  people,
  projectPricing,
  projects,
  scenarios,
} from "./schema";
import { occupancy } from "@/lib/bench/occupancy";
import type { Member } from "@/lib/scenarios/change";
import type { FrozenValues } from "@/lib/scenarios/engine-input";
import {
  type LoadedScenario,
  type ScenarioBasis,
  scenarioView,
} from "@/lib/scenarios/scenario-view";

import { engineBasis, frozenValues, plannedPeriodOf } from "./scenario-basis";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Loading a scenario". The view comes from `scenarioView`, the function the page
// runs again on every change, over a basis that holds everything but the team.

/** A loaded scenario, with what the page needs to edit it: its basis, team and version. */
export type EditableScenario = LoadedScenario & {
  editing: { basis: ScenarioBasis; team: Member[]; version: number };
};

/** The rows everyone reads; undefined when the scenario is not in the organization. */
async function readStructure(tx: TenantTransaction, scenarioId: string, today: string) {
  const [scenario] = await tx
    .select({
      projectId: projects.id,
      project: projects.name,
      client: projects.client,
      pricingModel: projects.pricingModel,
      plannedStart: projects.plannedStart,
      plannedEnd: projects.plannedEnd,
      description: projects.description,
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
  // Occupancy holds no money, so everyone reads it (domain, "How busy a person is").
  const chosen = await tx
    .select({
      personId: assignments.personId,
      allocation: assignments.allocation,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
    })
    .from(assignments)
    .innerJoin(scenarios, eq(scenarios.id, assignments.scenarioId))
    .where(
      and(
        eq(scenarios.chosen, true),
        isNotNull(assignments.personId),
        lte(assignments.startDate, today),
        gte(assignments.endDate, today),
      ),
    );
  const busy = occupancy(chosen, today);
  // The weekly load's commitments hold no money either (domain, "Weekly load"): the people of the
  // other projects' chosen scenarios, inactive ones too, since a chosen scenario still commits them.
  const commitments = await tx
    .select({
      id: assignments.id,
      personId: assignments.personId,
      projectId: projects.id,
      projectName: projects.name,
      allocation: assignments.allocation,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
    })
    .from(assignments)
    .innerJoin(scenarios, eq(scenarios.id, assignments.scenarioId))
    .innerJoin(projects, eq(projects.id, scenarios.projectId))
    .where(
      and(
        eq(scenarios.chosen, true),
        ne(scenarios.projectId, scenario.projectId),
        isNotNull(assignments.personId),
        gt(assignments.allocation, 0),
      ),
    )
    .orderBy(assignments.startDate, assignments.id);
  const categoryNames = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(categories.name, categories.id);
  // Rule i: a project has one chosen scenario at most, the one choosing this one would replace.
  const [otherChosen] = await tx
    .select({ name: scenarios.name })
    .from(scenarios)
    .where(
      and(
        eq(scenarios.projectId, scenario.projectId),
        eq(scenarios.chosen, true),
        ne(scenarios.id, scenarioId),
      ),
    );
  return {
    ...scenario,
    otherChosen: otherChosen?.name ?? null,
    config: settings,
    team,
    roster: roster.map((person) => ({ ...person, occupancy: busy.get(person.id) ?? 0 })),
    categories: categoryNames,
    // The query keeps assignments with a person only.
    commitments: commitments.flatMap(({ personId, ...rest }) =>
      personId === null ? [] : [{ personId, ...rest }],
    ),
  };
}

/**
 * A chosen scenario's frozen values (rule b), read with rate access; undefined when it has none,
 * so it is costed with the current values until they are written.
 */
async function readFrozen(
  tx: TenantTransaction,
  scenarioId: string,
): Promise<FrozenValues | undefined> {
  const [settings] = await tx
    .select()
    .from(frozenCostConfig)
    .where(eq(frozenCostConfig.scenarioId, scenarioId));
  if (!settings) return undefined;
  const rates = await tx
    .select()
    .from(frozenRates)
    .where(eq(frozenRates.scenarioId, scenarioId))
    .orderBy(frozenRates.categoryId);
  return frozenValues(settings, rates);
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
 * A scenario's view with the organization's current values, or a chosen scenario's frozen ones
 * (rule b), and what the page needs to edit it, or null when the scenario is not in the
 * organization. Without rate access the open part and its hours only: never a money figure, in the
 * view or the basis.
 */
export async function loadScenario(
  db: NodePgDatabase,
  context: AccessContext,
  scenarioIdInput: string,
  /** The day occupancy is measured on, `YYYY-MM-DD`; the page passes Madrid's today. */
  today: string,
): Promise<EditableScenario | null> {
  const scenarioId = z.uuid().parse(scenarioIdInput);
  const day = z.iso.date().parse(today);
  return withOrganization(db, context, (tx) => scenarioIn(tx, context, scenarioId, day));
}

/**
 * `loadScenario` inside a tenant transaction that is already open, so a comparison reads its
 * scenarios in one. The id and the day must already be valid.
 */
export async function scenarioIn(
  tx: TenantTransaction,
  context: AccessContext,
  scenarioId: string,
  day: string,
  /** The organization's current values even for a chosen scenario, as a revision takes them. */
  { currentValues = false }: { currentValues?: boolean } = {},
): Promise<EditableScenario | null> {
  const structure = await readStructure(tx, scenarioId, day);
  if (!structure) return null;
  const { projectId, pricingModel, config: settings, team } = structure;
  // The engine's inputs without a team: `scenarioView` adds it, and its year's calendar.
  const money = context.rateAccess ? await readMoney(tx, scenarioId, projectId) : null;
  const frozen =
    money && structure.chosen && !currentValues ? await readFrozen(tx, scenarioId) : undefined;
  const plannedPeriod = plannedPeriodOf(structure);
  const engine = engineBasis(
    { pricingModel, config: settings, plannedPeriod },
    money,
    frozen,
    structure.roster,
  );
  const basis: ScenarioBasis = {
    project: {
      id: projectId,
      name: structure.project,
      client: structure.client,
      pricingModel,
      plannedPeriod,
      description: structure.description,
    },
    scenario: {
      name: structure.name,
      chosen: structure.chosen,
      otherChosen: structure.otherChosen,
    },
    categories: structure.categories,
    people: structure.roster,
    defaultWeeklyHours: settings.defaultWeeklyHours,
    commitments: structure.commitments,
    engine,
  };
  return {
    ...scenarioView(basis, team),
    editing: { basis, team, version: structure.version },
  };
}
