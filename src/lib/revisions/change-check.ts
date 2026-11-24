import { teamOverAllocation } from "@/lib/load/over-allocation";
import type { Member } from "@/lib/scenarios/change";
import { type ScenarioBasis, engineInputFor } from "@/lib/scenarios/scenario-view";

import { membersOf } from "./chosen-revision";
import { equalJson } from "./same-revision";
import type { OpenPart, RestrictedPart } from "./snapshot";

// docs/domain.md, "Choosing a revision": the change check. Choosing a revision first lists what
// changed since it was made, against what would be saved today. Nothing in it blocks choosing: the
// revision keeps the values it was made with. Items with money need both restricted parts, which
// the database gives only with rate access (ADR 0005).

type Rate = RestrictedPart["rates"][number];
type Pricing = RestrictedPart["pricing"];
type CostSettings = RestrictedPart["costSettings"];
type Period = RestrictedPart["plannedPeriod"];
type Named = { id: string; name: string };

/** What would be saved today, as the check reads it. */
export type CheckNow = {
  /** The scenario's saved team, in its order. */
  team: readonly Member[];
  pricingModel: OpenPart["pricingModel"];
  rulesVersion: number;
  /**
   * The over-allocated weeks of the revision's own team today, by assignment id, against today's
   * chosen scenarios of other projects (rule c). Assignments without one are absent.
   */
  overAllocation: ReadonlyMap<string, readonly { start: string }[]>;
  /** Today's money, with rate access only; null without it. */
  money: {
    /** Today's rates of the organization; the check reads those of the revision's categories. */
    rates: readonly Rate[];
    /** In effect today, for the revision's team: its availability factor's calendar too. */
    costSettings: CostSettings;
    pricing: Pricing;
    plannedPeriod: Period;
    extraCosts: RestrictedPart["extraCosts"];
  } | null;
};

/** One thing that changed since the revision was made, in the order the dialog lists them. */
export type Change =
  | { kind: "team"; added: number; removed: number; changed: number }
  | { kind: "extraCosts" }
  /** A person over-allocated now and in no week then (`now`), or the other way round. */
  | { kind: "load"; person: Named; now: boolean; weeks: number }
  | { kind: "rate"; category: Named; then: Rate | null; now: Rate | null }
  | { kind: "pricingModel"; then: Pricing["model"]; now: Pricing["model"] }
  /** The fixed price, or the budget cap in T&M (rule e); null when not set. */
  | { kind: "price"; then: number | null; now: number | null }
  | { kind: "plannedPeriod"; then: Period; now: Period }
  | { kind: "overhead"; then: number; now: number }
  | { kind: "buffer"; then: number; now: number }
  | {
      kind: "availability";
      then: Pick<CostSettings, "netAnnualHours" | "calendarWorkingHours">;
      now: Pick<CostSettings, "netAnnualHours" | "calendarWorkingHours">;
    }
  | { kind: "rulesVersion"; then: number; now: number };

/** As the database gives a value back: JSON, without undefined fields. */
const asStored = (value: unknown): unknown => JSON.parse(JSON.stringify(value) ?? "null");
const same = (a: unknown, b: unknown) => equalJson(asStored(a), asStored(b));

/** What an assignment commits to, without its id: a name changed elsewhere does not count. */
const terms = (member: Member): Partial<Member> => {
  const rest: Partial<Member> = { ...member };
  delete rest.id;
  return rest;
};

function teamChange(then: readonly Member[], now: readonly Member[]): Change[] {
  const saved = new Map(now.map((member) => [member.id, member]));
  const kept = new Set(then.map((member) => member.id));
  let removed = 0;
  let changed = 0;
  for (const member of then) {
    const current = saved.get(member.id);
    if (!current) removed += 1;
    else if (!same(terms(member), terms(current))) changed += 1;
  }
  const added = now.filter((member) => !kept.has(member.id)).length;
  return added + removed + changed > 0 ? [{ kind: "team", added, removed, changed }] : [];
}

function loadChanges(open: OpenPart, now: CheckNow["overAllocation"]): Change[] {
  const then = new Map(open.overAllocation.map((entry) => [entry.assignmentId, entry.weeks]));
  const people = new Map<string, { person: Named; then: Set<string>; now: Set<string> }>();
  for (const member of open.team) {
    if (!member.person) continue;
    const entry = people.get(member.person.id) ?? {
      person: member.person,
      then: new Set<string>(),
      now: new Set<string>(),
    };
    for (const week of then.get(member.id) ?? []) entry.then.add(week.start);
    for (const week of now.get(member.id) ?? []) entry.now.add(week.start);
    people.set(member.person.id, entry);
  }
  return [...people.values()].flatMap(({ person, then: before, now: after }): Change[] => {
    if (before.size === 0 && after.size > 0) {
      return [{ kind: "load", person, now: true, weeks: after.size }];
    }
    if (before.size > 0 && after.size === 0) {
      return [{ kind: "load", person, now: false, weeks: before.size }];
    }
    return [];
  });
}

const byId = <T extends { id: string }>(items: readonly T[]) =>
  items.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const amountOf = (pricing: Pricing): number | null =>
  (pricing.model === "fixed" ? pricing.priceCents : pricing.budgetCapCents) ?? null;

function moneyChanges(
  open: OpenPart,
  then: RestrictedPart,
  now: NonNullable<CheckNow["money"]>,
): { extraCosts: Change[]; rest: Change[] } {
  const extraCosts: Change[] = same(byId(then.extraCosts), byId(now.extraCosts))
    ? []
    : [{ kind: "extraCosts" }];

  const categories = new Map<string, Named>();
  for (const { category } of open.team) categories.set(category.id, category);
  const rates = [...categories.values()].flatMap((category): Change[] => {
    const before = then.rates.find((rate) => rate.categoryId === category.id) ?? null;
    const after = now.rates.find((rate) => rate.categoryId === category.id) ?? null;
    return same(before, after) ? [] : [{ kind: "rate", category, then: before, now: after }];
  });

  const price: Change[] =
    // A price and a budget cap are different things: the model change says it (pricingModel).
    then.pricing.model !== now.pricing.model || amountOf(then.pricing) === amountOf(now.pricing)
      ? []
      : [{ kind: "price", then: amountOf(then.pricing), now: amountOf(now.pricing) }];
  const period: Change[] = same(then.plannedPeriod, now.plannedPeriod)
    ? []
    : [{ kind: "plannedPeriod", then: then.plannedPeriod, now: now.plannedPeriod }];
  const before = then.costSettings;
  const after = now.costSettings;
  const overhead: Change[] =
    before.overheadBasisPoints === after.overheadBasisPoints
      ? []
      : [{ kind: "overhead", then: before.overheadBasisPoints, now: after.overheadBasisPoints }];
  const buffer: Change[] =
    before.bufferBasisPoints === after.bufferBasisPoints
      ? []
      : [{ kind: "buffer", then: before.bufferBasisPoints, now: after.bufferBasisPoints }];
  const factor = ({ netAnnualHours, calendarWorkingHours }: CostSettings) => ({
    netAnnualHours,
    calendarWorkingHours,
  });
  const availability: Change[] = same(factor(before), factor(after))
    ? []
    : [{ kind: "availability", then: factor(before), now: factor(after) }];

  return {
    extraCosts,
    rest: [...rates, ...price, ...period, ...overhead, ...buffer, ...availability],
  };
}

/**
 * What changed since a revision was made, against what would be saved today. Empty when nothing
 * did. Items with money only when both its restricted part and today's money are given.
 */
export function changesSince(
  revision: { open: OpenPart; restricted: RestrictedPart | null },
  now: CheckNow,
): Change[] {
  const { open, restricted } = revision;
  const money = restricted && now.money ? moneyChanges(open, restricted, now.money) : null;
  const model: Change[] =
    open.pricingModel === now.pricingModel
      ? []
      : [{ kind: "pricingModel", then: open.pricingModel, now: now.pricingModel }];
  const rules: Change[] =
    open.rulesVersion < now.rulesVersion
      ? [{ kind: "rulesVersion", then: open.rulesVersion, now: now.rulesVersion }]
      : [];
  return [
    ...teamChange(membersOf(open), now.team),
    ...(money?.extraCosts ?? []),
    ...loadChanges(open, now.overAllocation),
    ...model,
    ...(money?.rest ?? []),
    ...rules,
  ];
}

/**
 * What would be saved today, from the basis and saved team the scenario's page loads with the
 * current values: today's rates, settings and project, and the revision's own team loaded against
 * today's chosen scenarios of other projects, in the revision's weeks.
 */
export function checkNowFor(
  basis: ScenarioBasis,
  team: readonly Member[],
  revision: { open: OpenPart; restricted: RestrictedPart | null },
  rulesVersion: number,
): CheckNow {
  const revisionTeam = membersOf(revision.open);
  const overAllocation = teamOverAllocation({
    projectId: basis.project.id,
    plannedPeriod: revision.restricted
      ? revision.restricted.plannedPeriod
      : basis.project.plannedPeriod,
    team: revisionTeam,
    commitments: basis.commitments,
  });
  const base = {
    team,
    pricingModel: basis.engine.input.scenario.pricing.model,
    rulesVersion,
    overAllocation,
  };
  if (!basis.engine.rateAccess) return { ...base, money: null };
  // Today's settings for the revision's team: the availability factor's calendar is its year's.
  const forRevision = engineInputFor(basis, revisionTeam);
  const saved = engineInputFor(basis, team);
  return {
    ...base,
    money: {
      rates: forRevision.rates,
      costSettings: forRevision.costSettings,
      pricing: saved.scenario.pricing,
      plannedPeriod: saved.scenario.plannedPeriod ?? null,
      extraCosts: saved.scenario.extraCosts,
    },
  };
}
