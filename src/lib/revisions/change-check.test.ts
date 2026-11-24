// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PLAN_A, RATES } from "@/lib/comparison/comparison.fixtures";

import { buildRevision } from "./build-revision";
import { type Change, type CheckNow, changesSince } from "./change-check";
import { membersOf } from "./chosen-revision";
import { sourceArb } from "./revision.arbitraries";
import { planSource } from "./revision.fixtures";
import { sameAsRevision } from "./same-revision";
import type { RevisionSnapshot } from "./snapshot";

// docs/domain.md, "Choosing a revision" and "Revision examples": the change check lists what
// changed since a revision was made, against what would be saved today.

/** What would be saved today when nothing changed: the revision's own values. */
const nowOf = ({ open, restricted }: RevisionSnapshot): CheckNow => ({
  team: membersOf(open),
  pricingModel: open.pricingModel,
  rulesVersion: open.rulesVersion,
  overAllocation: new Map(open.overAllocation.map((entry) => [entry.assignmentId, entry.weeks])),
  money: {
    rates: restricted.rates,
    costSettings: restricted.costSettings,
    pricing: restricted.pricing,
    plannedPeriod: restricted.plannedPeriod,
    extraCosts: restricted.extraCosts,
  },
});

const money = (now: CheckNow) => {
  if (!now.money) throw new Error("No money today");
  return now.money;
};

/** Revision 1 of Plan A, as the revision examples start from. */
const revision1 = () => buildRevision(planSource("Plan A", PLAN_A));

const intranet = (allocation: number) => [
  {
    id: "intranet-senior",
    personId: "senior-1",
    projectId: "intranet",
    projectName: "Intranet",
    allocation,
    startDate: "2027-04-05",
    endDate: "2027-04-16",
  },
];

describe("changesSince", () => {
  it("lists nothing for a revision checked against itself", () => {
    const revision = revision1();
    expect(changesSince(revision, nowOf(revision))).toEqual([]);
  });

  it("lists the team saved since (Old revision chosen)", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const team = now.team.filter((member) => member.id !== "a-devops");
    expect(changesSince(revision, { ...now, team })).toEqual([
      { kind: "team", added: 0, removed: 1, changed: 0 },
    ]);
  });

  it("counts assignments added and changed", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const [first, ...rest] = now.team;
    if (!first) throw new Error("Plan A has a team");
    const team = [{ ...first, allocation: 20 }, ...rest, { ...first, id: "a-new" }];
    expect(changesSince(revision, { ...now, team })).toEqual([
      { kind: "team", added: 1, removed: 0, changed: 1 },
    ]);
  });

  it("lists the price (Price changes after)", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const changes = changesSince(revision, {
      ...now,
      money: { ...money(now), pricing: { model: "fixed", priceCents: 21_000_000 } },
    });
    expect(changes).toEqual([{ kind: "price", then: 20_000_000, now: 21_000_000 }]);
  });

  it("lists a change of pricing model alone, not a price against a budget cap", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const changes = changesSince(revision, {
      ...now,
      pricingModel: "timeAndMaterials",
      money: { ...money(now), pricing: { model: "timeAndMaterials" } },
    });
    expect(changes).toEqual([{ kind: "pricingModel", then: "fixed", now: "timeAndMaterials" }]);
  });

  it("lists an older rules version (Rules move on)", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const then = revision.open.rulesVersion;
    expect(changesSince(revision, { ...now, rulesVersion: then + 1 })).toEqual([
      { kind: "rulesVersion", then, now: then + 1 },
    ]);
  });

  it("lists a category whose rate differs or is missing now, with both", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const senior = RATES.find((rate) => rate.categoryId === "senior");
    if (!senior) throw new Error("The fixtures rate the Senior Developer");
    const raised = { ...senior, cost: { kind: "annual" as const, fullyLoadedCents: 8_000_000 } };
    const rates = money(now)
      .rates.filter((rate) => rate.categoryId !== "devops")
      .map((rate) => (rate.categoryId === "senior" ? raised : rate));
    const changes = changesSince(revision, { ...now, money: { ...money(now), rates } });
    expect(changes).toEqual([
      expect.objectContaining({ kind: "rate", then: senior, now: raised }),
      expect.objectContaining({ kind: "rate", now: null }),
    ]);
    expect(changes.map((change) => change.kind === "rate" && change.category.id)).toEqual([
      "senior",
      "devops",
    ]);
  });

  it("lists the extra costs saved since, whatever their order", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const extra = { id: "licence", kind: "fixed" as const, amountCents: 50_000 };
    const extraCosts = [extra, ...money(now).extraCosts];
    expect(changesSince(revision, { ...now, money: { ...money(now), extraCosts } })).toEqual([
      { kind: "extraCosts" },
    ]);
    const twice = buildRevision(
      planSource("Plan A", PLAN_A, { extraCosts: [...money(now).extraCosts, extra] }),
    );
    expect(
      changesSince(twice, { ...nowOf(twice), money: { ...money(nowOf(twice)), extraCosts } }),
    ).toEqual([]);
  });

  it("lists the project's conditions and the availability factor", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const settings = money(now).costSettings;
    const changes = changesSince(revision, {
      ...now,
      pricingModel: "timeAndMaterials",
      money: {
        ...money(now),
        pricing: { model: "timeAndMaterials", budgetCapCents: 20_000_000 },
        plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
        costSettings: {
          overheadBasisPoints: settings.overheadBasisPoints + 100,
          bufferBasisPoints: settings.bufferBasisPoints + 100,
          netAnnualHours: settings.netAnnualHours - 50,
          calendarWorkingHours: settings.calendarWorkingHours,
        },
      },
    });
    expect(changes.map((change) => change.kind)).toEqual([
      "pricingModel",
      "plannedPeriod",
      "overhead",
      "buffer",
      "availability",
    ]);
  });

  it("lists people over-allocated now and not then, or the other way round", () => {
    const loaded = buildRevision(planSource("Plan A", PLAN_A, { commitments: intranet(50) }));
    expect(loaded.open.overAllocation).not.toEqual([]);
    expect(changesSince(loaded, { ...nowOf(loaded), overAllocation: new Map() })).toEqual([
      { kind: "load", person: { id: "senior-1", name: "Person senior-1" }, now: false, weeks: 2 },
    ]);

    const free = revision1();
    expect(
      changesSince(free, { ...nowOf(free), overAllocation: nowOf(loaded).overAllocation }),
    ).toEqual([
      { kind: "load", person: { id: "senior-1", name: "Person senior-1" }, now: true, weeks: 2 },
    ]);
  });

  it("lists no money without both restricted parts", () => {
    const revision = revision1();
    const now = nowOf(revision);
    const changed: CheckNow = {
      ...now,
      rulesVersion: now.rulesVersion + 1,
      money: { ...money(now), pricing: { model: "fixed", priceCents: 1 } },
    };
    const open = { open: revision.open, restricted: null };
    expect(changesSince(open, changed).map((change) => change.kind)).toEqual(["rulesVersion"]);
    expect(changesSince(revision, { ...changed, money: null }).map((c) => c.kind)).toEqual([
      "rulesVersion",
    ]);
  });
});

/** One change made to what would be saved today, and the kind of item it must give. */
type Mutation = { kind: Change["kind"]; apply: (now: CheckNow) => CheckNow | null };

const withMoney = (now: CheckNow, change: Partial<NonNullable<CheckNow["money"]>>) => ({
  ...now,
  money: { ...money(now), ...change },
});

const MUTATIONS: Mutation[] = [
  {
    kind: "team",
    apply: (now) => ({ ...now, team: now.team.slice(1) }),
  },
  {
    kind: "extraCosts",
    apply: (now) =>
      withMoney(now, {
        extraCosts: [...money(now).extraCosts, { id: "extra", kind: "fixed", amountCents: 1 }],
      }),
  },
  {
    kind: "rate",
    apply: (now) => {
      const [first, ...rest] = money(now).rates;
      if (!first) return null;
      return withMoney(now, {
        rates: [{ ...first, sellRateCents: first.sellRateCents + 1 }, ...rest],
      });
    },
  },
  {
    kind: "pricingModel",
    apply: (now) => ({
      ...now,
      pricingModel: now.pricingModel === "fixed" ? "timeAndMaterials" : "fixed",
    }),
  },
  {
    kind: "price",
    apply: (now) => {
      const pricing = money(now).pricing;
      return withMoney(now, {
        pricing:
          pricing.model === "fixed"
            ? { model: "fixed", priceCents: (pricing.priceCents ?? 0) + 1 }
            : { model: "timeAndMaterials", budgetCapCents: (pricing.budgetCapCents ?? 0) + 1 },
      });
    },
  },
  {
    kind: "plannedPeriod",
    apply: (now) =>
      withMoney(now, {
        plannedPeriod:
          money(now).plannedPeriod === null ? { start: "2030-01-01", end: "2030-01-31" } : null,
      }),
  },
  {
    kind: "overhead",
    apply: (now) => {
      const settings = money(now).costSettings;
      return withMoney(now, {
        costSettings: { ...settings, overheadBasisPoints: settings.overheadBasisPoints + 1 },
      });
    },
  },
  {
    kind: "buffer",
    apply: (now) => {
      const settings = money(now).costSettings;
      return withMoney(now, {
        costSettings: { ...settings, bufferBasisPoints: settings.bufferBasisPoints + 1 },
      });
    },
  },
  {
    kind: "availability",
    apply: (now) => {
      const settings = money(now).costSettings;
      return withMoney(now, {
        costSettings: { ...settings, netAnnualHours: settings.netAnnualHours + 1 },
      });
    },
  },
  {
    kind: "rulesVersion",
    apply: (now) => ({ ...now, rulesVersion: now.rulesVersion + 1 }),
  },
];

describe("changesSince, for any revision", () => {
  it("lists nothing for a revision checked against itself", () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const revision = buildRevision(source);
        expect(changesSince(revision, nowOf(revision))).toEqual([]);
      }),
    );
  });

  it("gives exactly one item of its kind for each change", () => {
    fc.assert(
      fc.property(sourceArb, fc.constantFrom(...MUTATIONS), (source, { kind, apply }) => {
        const revision = buildRevision(source);
        if (kind === "team" && revision.open.team.length === 0) return;
        const now = apply(nowOf(revision));
        if (!now) return;
        const changes = changesSince(revision, now);
        expect(changes.map((change) => change.kind)).toEqual([kind]);
      }),
    );
  });

  it("lists a person's load when only their load moved", () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const revision = buildRevision(source);
        const loaded = revision.open.team.filter((member) => member.person !== null);
        const [first] = loaded;
        if (!first?.person) return;
        const personId = first.person.id;
        const now = nowOf(revision);
        const wasOver = loaded.some(
          (member) =>
            member.person?.id === personId &&
            revision.open.overAllocation.some((entry) => entry.assignmentId === member.id),
        );
        const overAllocation = new Map(now.overAllocation);
        for (const member of loaded) {
          if (member.person?.id !== personId) continue;
          if (wasOver) overAllocation.delete(member.id);
          else overAllocation.set(member.id, [{ start: member.startDate }]);
        }
        const changes = changesSince(revision, { ...now, overAllocation });
        expect(changes).toEqual([
          expect.objectContaining({ kind: "load", person: first.person, now: !wasOver }),
        ]);
      }),
    );
  });

  it("lists only load when the revision would be used again", () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const revision = buildRevision(source);
        const today = buildRevision({ ...source, overAllocation: new Map() });
        expect(sameAsRevision(today, revision)).toBe(true);
        const kinds = changesSince(revision, nowOf(today)).map((change) => change.kind);
        expect(kinds.every((kind) => kind === "load")).toBe(true);
      }),
    );
  });
});
