import { asc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { categoryOccupancy } from "@/lib/bench/category-occupancy";
import { occupancy } from "@/lib/bench/occupancy";
import type { Portfolio, PortfolioScenario } from "@/lib/portfolio/portfolio";
import type { Member } from "@/lib/scenarios/change";
import type { FrozenValues } from "@/lib/scenarios/engine-input";
import { type ScenarioBasis, scenarioView } from "@/lib/scenarios/scenario-view";

import { type MoneyRows, engineBasis, frozenValues } from "./scenario-basis";
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
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "The organization at a glance": every project of the organization with its
// scenarios, each costed by `scenarioView` over the basis the scenario page builds, so Inicio and
// the editor never disagree. A handful of queries for the whole organization, never one per
// scenario. Without rate access no restricted table is read, so no money can come out.

/** The rows everyone reads. */
async function readStructure(tx: TenantTransaction) {
  return {
    projects: await tx
      .select({
        id: projects.id,
        name: projects.name,
        client: projects.client,
        pricingModel: projects.pricingModel,
      })
      .from(projects)
      .orderBy(asc(projects.name), asc(projects.id)),
    scenarios: await tx
      .select({
        id: scenarios.id,
        projectId: scenarios.projectId,
        name: scenarios.name,
        chosen: scenarios.chosen,
      })
      .from(scenarios)
      .orderBy(asc(scenarios.name), asc(scenarios.id)),
    team: await tx
      .select({
        id: assignments.id,
        scenarioId: assignments.scenarioId,
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
      .orderBy(asc(assignments.startDate), asc(assignments.id)),
    people: await tx
      .select({
        id: people.id,
        name: people.name,
        categoryId: people.categoryId,
        weeklyHours: people.weeklyHours,
        active: people.active,
      })
      .from(people)
      .orderBy(asc(people.name), asc(people.id)),
    categories: await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name), asc(categories.id)),
    config: (
      await tx
        .select({
          netAnnualHours: config.netAnnualHours,
          defaultWeeklyHours: config.defaultWeeklyHours,
        })
        .from(config)
    )[0],
  };
}

/** The restricted rows of every scenario: read only with rate access (ADR 0005). */
async function readMoney(tx: TenantTransaction) {
  return {
    costConfig: (
      await tx
        .select({
          overhead: costConfig.overhead,
          buffer: costConfig.buffer,
          targetMargin: costConfig.targetMargin,
        })
        .from(costConfig)
    )[0],
    pricing: await tx
      .select({
        projectId: projectPricing.projectId,
        price: projectPricing.price,
        overhead: projectPricing.overhead,
        buffer: projectPricing.buffer,
      })
      .from(projectPricing),
    extraCosts: await tx
      .select({
        id: extraCosts.id,
        scenarioId: extraCosts.scenarioId,
        label: extraCosts.label,
        kind: extraCosts.kind,
        amount: extraCosts.amount,
        percentage: extraCosts.percentage,
        base: extraCosts.base,
        startDate: extraCosts.startDate,
        endDate: extraCosts.endDate,
      })
      .from(extraCosts)
      .orderBy(asc(extraCosts.id)),
    rates: await tx
      .select({
        categoryId: categoryRates.categoryId,
        grossAnnualSalaryCents: categoryRates.grossAnnualSalary,
        socialSecurityBasisPoints: categoryRates.socialSecurity,
        otherYearlyCostsCents: categoryRates.otherYearlyCosts,
        manualCostPerHourCents: categoryRates.manualCostPerHour,
        sellRateCents: categoryRates.sellRate,
      })
      .from(categoryRates),
    frozenSettings: await tx.select().from(frozenCostConfig),
    frozenRates: await tx
      .select()
      .from(frozenRates)
      .orderBy(asc(frozenRates.scenarioId), asc(frozenRates.categoryId)),
  };
}

type Money = Awaited<ReturnType<typeof readMoney>>;

/** One scenario's money rows and frozen values, out of the organization's. */
function moneyOf(
  money: Money,
  projectId: string,
  scenarioId: string,
): { rows: MoneyRows; frozen: FrozenValues | undefined } {
  const pricing = money.pricing.find((row) => row.projectId === projectId);
  const settings = money.frozenSettings.find((row) => row.scenarioId === scenarioId);
  return {
    rows: {
      costConfig: money.costConfig,
      ...(pricing && { pricing }),
      extraCosts: money.extraCosts.filter((row) => row.scenarioId === scenarioId),
      rates: money.rates,
    },
    frozen:
      settings &&
      frozenValues(
        settings,
        money.frozenRates.filter((row) => row.scenarioId === scenarioId),
      ),
  };
}

/**
 * The organization's projects and their scenarios, costed with its current values or a chosen
 * scenario's frozen ones (rule b), with each category's occupancy on `today` (`YYYY-MM-DD`, the
 * page passes Madrid's). Without rate access, no price and no scenario's money.
 */
export async function loadPortfolio(
  db: NodePgDatabase,
  context: AccessContext,
  today: string,
): Promise<Portfolio> {
  const day = z.iso.date().parse(today);
  return withOrganization(db, context, async (tx) => {
    const structure = await readStructure(tx);
    const money = context.rateAccess ? await readMoney(tx) : null;

    // Occupancy holds no money, so everyone reads it (domain, "How busy a person is").
    const chosen = new Set(structure.scenarios.filter((s) => s.chosen).map((s) => s.id));
    const busy = occupancy(
      structure.team.filter((member) => chosen.has(member.scenarioId)),
      day,
    );
    const roster = structure.people.map((person) => ({
      ...person,
      occupancy: busy.get(person.id) ?? 0,
    }));

    const costed = (
      project: (typeof structure.projects)[number],
      scenario: (typeof structure.scenarios)[number],
    ): PortfolioScenario => {
      if (!structure.config) throw new Error("The organization has no config");
      const team: Member[] = structure.team
        .filter((member) => member.scenarioId === scenario.id)
        .map((member) => ({
          id: member.id,
          projectRole: member.projectRole,
          categoryId: member.categoryId,
          personId: member.personId,
          reportsTo: member.reportsTo,
          weeklyHours: member.weeklyHours,
          allocation: member.allocation,
          startDate: member.startDate,
          endDate: member.endDate,
        }));
      const own = money && moneyOf(money, project.id, scenario.id);
      const basis: ScenarioBasis = {
        project: { name: project.name, client: project.client, pricingModel: project.pricingModel },
        scenario: { name: scenario.name, chosen: scenario.chosen, otherChosen: null },
        categories: structure.categories,
        people: roster,
        defaultWeeklyHours: structure.config.defaultWeeklyHours,
        engine: engineBasis(
          { pricingModel: project.pricingModel, config: structure.config },
          own?.rows ?? null,
          scenario.chosen ? own?.frozen : undefined,
          roster,
        ),
      };
      const view = scenarioView(basis, team);
      const people = team.filter((member) => member.personId !== null).length;
      const base = {
        id: scenario.id,
        name: scenario.name,
        chosen: scenario.chosen,
        people,
        openRoles: team.length - people,
      };
      if (!view.rateAccess) {
        return { ...base, effectiveHours: view.hours.effective, money: null };
      }
      const { result } = view;
      return {
        ...base,
        effectiveHours: result.hours.effective,
        money: {
          netMarginCents: result.netMarginCents,
          netMarginBasisPoints: result.netMarginBasisPoints,
          marginStatus: result.marginStatus,
          warnings: result.warnings,
        },
      };
    };

    return {
      rateAccess: context.rateAccess,
      projects: structure.projects.map((project) => ({
        ...project,
        price: money && {
          cents: money.pricing.find((row) => row.projectId === project.id)?.price ?? null,
        },
        scenarios: structure.scenarios
          .filter((scenario) => scenario.projectId === project.id)
          .map((scenario) => costed(project, scenario)),
      })),
      categories: structure.categories,
      activePeople: structure.people.filter((person) => person.active).length,
      occupancy: categoryOccupancy(structure.categories, structure.people, busy),
    };
  });
}
