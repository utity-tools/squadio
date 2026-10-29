import { z } from "zod";

import { hasNationalHolidays, monthsCovered, workingDays } from "@/lib/calendar/calendar";
import { MAX_BASIS_POINTS, MAX_MONEY_CENTS } from "@/lib/money/numeric";

import { projectSpanDates } from "./project-span";
import { Rational, sum } from "./rational";
import { findReportsToCycle } from "./reports-to";

// Inputs, validated at the boundary: anything missing, NaN, infinite or empty fails with the path
// of its field. Money is integer cents and money-bearing percentages are basis points (domain
// rule g, ADR 0010).

const cents = z.int().min(0).max(MAX_MONEY_CENTS);
const basisPoints = z.int().min(0).max(MAX_BASIS_POINTS);
const id = z.string().min(1);
/** Cross-field checks run only on otherwise valid input, so one bad field gives one issue. */
const valid = ({ issues }: { issues: readonly unknown[] }) => issues.length === 0;
const isoDate = z.iso.date();
/** A date the national calendar can count working days in (rule h). */
const calendarDate = isoDate.refine(hasNationalHolidays, {
  message: "No national holidays are listed for this year",
  when: valid,
});
const label = z.string().max(100).regex(/\S/, "Must not be blank").optional();
/** Hours with at most `decimals` decimals, so they convert to an exact fraction. */
const hoursWith = (decimals: number) =>
  z
    .number()
    .positive()
    .refine(
      (value) => new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(String(value)),
      `At most ${decimals} decimals`,
    );
const hours = hoursWith(2);

const assignmentSchema = z
  .object({
    id,
    categoryId: id,
    reportsTo: id.nullable().optional(),
    weeklyHours: hours.max(168),
    allocation: z.int().min(0).max(100),
    startDate: calendarDate,
    endDate: calendarDate,
  })
  .refine((a) => a.endDate >= a.startDate, {
    message: "Ends before it starts",
    path: ["endDate"],
    when: valid,
  });

const extraCostSchema = z.discriminatedUnion("kind", [
  z.object({ id, label, kind: z.literal("fixed"), amountCents: cents }),
  z
    .object({
      id,
      label,
      kind: z.literal("recurring"),
      /** Per month. */
      amountCents: cents,
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
    })
    .refine((e) => e.startDate === undefined || e.endDate !== undefined, {
      message: "Set both dates or neither",
      path: ["endDate"],
      when: valid,
    })
    .refine((e) => e.endDate === undefined || e.startDate !== undefined, {
      message: "Set both dates or neither",
      path: ["startDate"],
      when: valid,
    })
    .refine((e) => !e.startDate || !e.endDate || e.endDate >= e.startDate, {
      message: "Ends before it starts",
      path: ["endDate"],
      when: valid,
    }),
  z.object({
    id,
    label,
    kind: z.literal("percentage"),
    basisPoints,
    base: z.enum(["staffCost", "revenue"]),
  }),
]);

const uniqueIds = (items: readonly { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

const scenarioSchema = z
  .object({
    pricing: z.discriminatedUnion("model", [
      /** Without a price the scenario is incomplete (rule l). */
      z.object({ model: z.literal("fixed"), priceCents: cents.min(1).optional() }),
      z.object({ model: z.literal("timeAndMaterials"), budgetCapCents: cents.min(1).optional() }),
    ]),
    assignments: z.array(assignmentSchema).refine(uniqueIds, "Assignment ids repeat"),
    extraCosts: z.array(extraCostSchema).refine(uniqueIds, "Extra cost ids repeat"),
  })
  .superRefine(
    ({ assignments, extraCosts }, context) => {
      // Without assignments there is no project span for an undated recurring cost (rule d).
      if (assignments.length === 0) {
        for (const [index, extra] of extraCosts.entries()) {
          if (extra.kind === "recurring" && extra.startDate === undefined) {
            context.addIssue({
              code: "custom",
              message: "Without assignments, a recurring cost needs its own dates",
              path: ["extraCosts", index, "startDate"],
            });
          }
        }
      }
      const ids = new Set(assignments.map((a) => a.id));
      for (const [index, a] of assignments.entries()) {
        if (a.reportsTo != null && !ids.has(a.reportsTo)) {
          context.addIssue({
            code: "custom",
            message: "Reports to an assignment outside the scenario",
            path: ["assignments", index, "reportsTo"],
          });
        }
      }
      const cycle = findReportsToCycle(assignments);
      if (cycle) {
        context.addIssue({
          code: "custom",
          message: `Reports-to cycle: ${cycle.join(" → ")}`,
          path: ["assignments"],
        });
      }
    },
    { when: valid },
  );

const categoryRateSchema = z.object({
  categoryId: id,
  /** 0 € is allowed: internal or unbilled work. */
  sellRateCents: cents,
  cost: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("annual"), fullyLoadedCents: cents }),
    z.object({ kind: z.literal("manual"), costPerHourCents: cents }),
  ]),
});

const ratesSchema = z
  .array(categoryRateSchema)
  .refine(
    (rates) => new Set(rates.map((rate) => rate.categoryId)).size === rates.length,
    "Category rates repeat",
  );

const costSettingsSchema = z
  .object({
    overheadBasisPoints: basisPoints,
    bufferBasisPoints: basisPoints,
    /** The two terms of the availability factor, kept apart so it stays exact (rule b). */
    netAnnualHours: hours,
    /** Weekly hours over 5 days give at most three decimals. */
    calendarWorkingHours: hoursWith(3),
  })
  .refine((settings) => settings.netAnnualHours <= settings.calendarWorkingHours, {
    message: "Net annual hours exceed calendar working hours: availability above 1",
    path: ["netAnnualHours"],
    when: valid,
  });

const targetMarginSchema = z.int().min(-MAX_BASIS_POINTS).max(MAX_BASIS_POINTS);

/** The four arguments as one object, so every issue's path starts with the argument's name. */
const inputSchema = z.object({
  scenario: scenarioSchema,
  rates: ratesSchema,
  costSettings: costSettingsSchema,
  targetMargin: targetMarginSchema,
});

export type Scenario = z.input<typeof scenarioSchema>;
export type Assignment = z.input<typeof assignmentSchema>;
export type ExtraCost = z.input<typeof extraCostSchema>;
export type CategoryRate = z.input<typeof categoryRateSchema>;
export type CostSettings = z.input<typeof costSettingsSchema>;

// Result.

export type MarginStatus = "green" | "amber" | "red";

export type Warning =
  | { code: "missingRate"; categoryIds: string[] }
  | { code: "missingPrice" }
  | { code: "budgetCapExceeded"; revenueCents: number; budgetCapCents: number };

type Hours = {
  hours: { nominal: number; effective: number };
  assignments: { id: string; nominalHours: number; effectiveHours: number }[];
};

/** What leaves a line undetermined: a category's rate (rule k) or a fixed price (rule l). */
export type Missing = Extract<Warning, { code: "missingRate" | "missingPrice" }>;

/**
 * A line that missing data leaves without an amount, never 0, with all it is missing (docs/domain.md,
 * "Partial results").
 */
export type Undetermined = { undetermined: Missing[] };

/**
 * The lines of a result. `Line` is an amount in cents; `Ratio` is a margin % or an effective rate,
 * null where it does not apply (no revenue, no effective hours).
 */
type Lines<Line, Ratio> = {
  /** The sum of the category lines, each rounded once. */
  staffCostCents: Line;
  /** In the order each category first appears in the assignments. */
  staffCostByCategory: {
    categoryId: string;
    effectiveHours: number;
    /**
     * Rounded for display only: the cost comes from the exact cost per hour, so effective hours
     * times this figure need not give `costCents`. Never recompute the cost from it.
     */
    costPerHourCents: Line;
    costCents: Line;
  }[];
  extraCosts: { id: string; amountCents: Line }[];
  directCostCents: Line;
  overheadCents: Line;
  bufferCents: Line;
  totalCostCents: Line;
  revenueCents: Line;
  directMarginCents: Line;
  /** Over revenue; null without revenue. */
  directMarginBasisPoints: Ratio;
  netMarginCents: Line;
  netMarginBasisPoints: Ratio;
  /** Revenue per effective hour; null without effective hours. */
  effectiveRateCents: Ratio;
  /**
   * Judged on the rounded net margin %; without revenue, null unless the net margin is negative.
   * Null too with an undetermined net margin.
   */
  marginStatus: MarginStatus | null;
  warnings: Warning[];
};

/**
 * One category's share of staff cost; never per person (ADR 0003, docs/domain.md "Staff cost by
 * category").
 */
export type CategoryStaffCost = CompleteResult["staffCostByCategory"][number];

export type CompleteResult = Hours & { complete: true } & Lines<number, number | null>;

/**
 * Some rate or the fixed price is missing: every line that does not need it is computed exactly as
 * in a complete result, and the others are undetermined, never 0 (rules k and l).
 */
export type PartialResult = Hours & { complete: false } & Lines<
    number | Undetermined,
    number | null | Undetermined
  >;

export type ScenarioResult = CompleteResult | PartialResult;

/** Whether a line has an amount (or a ratio, or null where none applies). */
export const isDetermined = <T>(line: T | Undetermined): line is T =>
  typeof line !== "object" || line === null || !("undetermined" in line);

/** Everything the lines miss, each category once, rates first. */
function missingOf(lines: readonly unknown[]): Missing[] {
  const categories = new Set<string>();
  let price = false;
  for (const line of lines) {
    if (isDetermined(line)) continue;
    for (const missing of (line as Undetermined).undetermined) {
      if (missing.code === "missingPrice") price = true;
      else for (const category of missing.categoryIds) categories.add(category);
    }
  }
  return [
    ...(categories.size > 0
      ? [{ code: "missingRate" as const, categoryIds: [...categories] }]
      : []),
    ...(price ? [{ code: "missingPrice" as const }] : []),
  ];
}

/** `compute` over the lines' amounts, or undetermined with all they miss. */
function from<T>(
  lines: readonly (number | Undetermined)[],
  compute: (...amounts: number[]) => T,
): T | Undetermined {
  const missing = missingOf(lines);
  return missing.length > 0 ? { undetermined: missing } : compute(...(lines as number[]));
}

const ONE_HUNDRED = Rational.of(100);
const TEN_THOUSAND = Rational.of(10_000);

const percentage = (basisPoints: number, cents: number) =>
  Rational.of(basisPoints).times(Rational.of(cents)).dividedBy(TEN_THOUSAND).round();

/** Rounds a ratio, naming it when it is too large to hold exactly. */
function roundRatio(name: string, value: Rational): number {
  try {
    return value.round();
  } catch (error) {
    throw new RangeError(`The ${name} is too large to hold exactly`, { cause: error });
  }
}

/** Margin over revenue, in basis points. */
const marginBasisPoints = (name: string, marginCents: number, revenueCents: number) =>
  revenueCents === 0
    ? null
    : roundRatio(
        name,
        Rational.of(marginCents).times(TEN_THOUSAND).dividedBy(Rational.of(revenueCents)),
      );

/** A monthly amount prorated by day per calendar month (rule d). */
const prorated = (monthlyCents: number, start: string, end: string) =>
  sum(
    monthsCovered(start, end).map(({ daysCovered, daysInMonth }) =>
      Rational.of(monthlyCents * daysCovered, daysInMonth),
    ),
  ).round();

/**
 * Cost, revenue and margin of a scenario, as docs/domain.md specifies. Pure: the same inputs give
 * the same result, whether they are current values or a chosen scenario's frozen ones.
 */
export function calculateScenario(
  scenarioInput: Scenario,
  ratesInput: readonly CategoryRate[],
  costSettingsInput: CostSettings,
  targetMarginInput: number,
): ScenarioResult {
  const input = inputSchema.parse({
    scenario: scenarioInput,
    rates: ratesInput,
    costSettings: costSettingsInput,
    targetMargin: targetMarginInput,
  });
  const { scenario, costSettings, targetMargin } = input;
  const rates = new Map(input.rates.map((rate) => [rate.categoryId, rate]));

  const netAnnualHours = Rational.fromDecimal(costSettings.netAnnualHours);
  const availability = netAnnualHours.dividedBy(
    Rational.fromDecimal(costSettings.calendarWorkingHours, 3),
  );

  const assignments = scenario.assignments.map((assignment) => {
    const nominal = Rational.of(workingDays(assignment.startDate, assignment.endDate))
      .times(Rational.fromDecimal(assignment.weeklyHours))
      .dividedBy(Rational.of(5))
      .times(Rational.of(assignment.allocation))
      .dividedBy(ONE_HUNDRED);
    return { assignment, nominal, effective: nominal.times(availability) };
  });

  const effectiveHours = sum(assignments.map(({ effective }) => effective));
  const hours: Hours = {
    hours: {
      nominal: sum(assignments.map(({ nominal }) => nominal)).toNumber(),
      effective: effectiveHours.toNumber(),
    },
    assignments: assignments.map(({ assignment, nominal, effective }) => ({
      id: assignment.id,
      nominalHours: nominal.toNumber(),
      effectiveHours: effective.toNumber(),
    })),
  };

  const missingRates = [
    ...new Set(
      scenario.assignments.map((a) => a.categoryId).filter((category) => !rates.has(category)),
    ),
  ];
  const { pricing } = scenario;

  const costPerHour = ({ cost }: z.infer<typeof categoryRateSchema>) =>
    cost.kind === "manual"
      ? Rational.of(cost.costPerHourCents)
      : Rational.of(cost.fullyLoadedCents).dividedBy(netAnnualHours);
  const rateOf = (categoryId: string) => {
    const rate = rates.get(categoryId);
    if (!rate) throw new Error(`No rate for ${categoryId}`);
    return rate;
  };
  const noRate = (categoryId: string): Undetermined => ({
    undetermined: [{ code: "missingRate", categoryIds: [categoryId] }],
  });

  // Staff cost is built from the category lines, each rounded once (rule g).
  const categoryHours = new Map<string, Rational>();
  for (const { assignment, effective } of assignments) {
    const hours = categoryHours.get(assignment.categoryId) ?? Rational.ZERO;
    categoryHours.set(assignment.categoryId, hours.plus(effective));
  }
  const staffCostByCategory = [...categoryHours].map(([categoryId, categoryEffective]) => {
    const rate = rates.get(categoryId);
    const perHour = rate && costPerHour(rate);
    return {
      categoryId,
      effectiveHours: categoryEffective.toNumber(),
      costPerHourCents: perHour ? perHour.round() : noRate(categoryId),
      costCents: perHour ? categoryEffective.times(perHour).round() : noRate(categoryId),
    };
  });
  const staffCostCents = from(
    staffCostByCategory.map((line) => line.costCents),
    (...costs) => costs.reduce((total, cost) => total + cost, 0),
  );

  // In T&M the sell rates live in the rates, so one missing rate leaves revenue undetermined.
  const revenueCents: number | Undetermined =
    pricing.model === "fixed"
      ? (pricing.priceCents ?? { undetermined: [{ code: "missingPrice" }] })
      : missingRates.length > 0
        ? { undetermined: [{ code: "missingRate", categoryIds: missingRates }] }
        : sum(
            assignments.map(({ assignment, effective }) =>
              effective.times(Rational.of(rateOf(assignment.categoryId).sellRateCents)),
            ),
          ).round();

  // Without dates, a recurring cost spans the project (rule d).
  const projectSpan = projectSpanDates(scenario.assignments);

  const extraCosts = scenario.extraCosts.map((extra) => {
    switch (extra.kind) {
      case "fixed":
        return { id: extra.id, amountCents: extra.amountCents };
      case "recurring": {
        // Validation guarantees a project span when the cost has no dates of its own.
        const start = extra.startDate ?? projectSpan?.start;
        const end = extra.endDate ?? projectSpan?.end;
        if (!start || !end) throw new Error(`No dates to prorate ${extra.id} over`);
        return { id: extra.id, amountCents: prorated(extra.amountCents, start, end) };
      }
      case "percentage": {
        const base = extra.base === "staffCost" ? staffCostCents : revenueCents;
        return {
          id: extra.id,
          amountCents: from([base], (cents) => percentage(extra.basisPoints, cents)),
        };
      }
    }
  });

  // Each result line is rounded once and built from the rounded lines above it (rule g); a line
  // that needs an undetermined one is undetermined too.
  const directCostCents = from(
    [staffCostCents, ...extraCosts.map((extra) => extra.amountCents)],
    (...costs) => costs.reduce((total, cost) => total + cost, 0),
  );
  const overheadCents = from([staffCostCents], (cents) =>
    percentage(costSettings.overheadBasisPoints, cents),
  );
  const bufferCents = from([directCostCents, overheadCents], (direct, overhead) =>
    percentage(costSettings.bufferBasisPoints, direct + overhead),
  );
  const totalCostCents = from(
    [directCostCents, overheadCents, bufferCents],
    (direct, overhead, buffer) => direct + overhead + buffer,
  );
  const directMarginCents = from(
    [revenueCents, directCostCents],
    (revenue, cost) => revenue - cost,
  );
  const netMarginCents = from([revenueCents, totalCostCents], (revenue, cost) => revenue - cost);

  const marginPercent = (name: string, margin: number | Undetermined) =>
    from([margin, revenueCents], (cents, revenue) => marginBasisPoints(name, cents, revenue));
  const netMarginBasisPoints = marginPercent("net margin %", netMarginCents);
  const marginStatus: MarginStatus | null =
    !isDetermined(netMarginCents) || !isDetermined(netMarginBasisPoints)
      ? null
      : netMarginCents < 0
        ? "red"
        : netMarginBasisPoints === null
          ? null
          : netMarginBasisPoints >= targetMargin
            ? "green"
            : "amber";

  const lines = {
    ...Object.fromEntries(
      staffCostByCategory.map((line) => [`staff cost of ${line.categoryId}`, line.costCents]),
    ),
    staffCostCents,
    ...Object.fromEntries(extraCosts.map((extra) => [`extra cost ${extra.id}`, extra.amountCents])),
    directCostCents,
    overheadCents,
    bufferCents,
    totalCostCents,
    revenueCents,
    directMarginCents,
    netMarginCents,
  };
  for (const [line, value] of Object.entries(lines)) {
    if (isDetermined(value) && Math.abs(value) > MAX_MONEY_CENTS) {
      throw new RangeError(`${line} (${value} cents) does not fit numeric(12,2)`);
    }
  }

  const warnings: Warning[] = [
    ...(missingRates.length > 0
      ? [{ code: "missingRate" as const, categoryIds: missingRates }]
      : []),
    ...(pricing.model === "fixed" && pricing.priceCents === undefined
      ? [{ code: "missingPrice" as const }]
      : []),
  ];
  // The cap is judged only against a determined revenue (rule e).
  if (
    pricing.model === "timeAndMaterials" &&
    pricing.budgetCapCents !== undefined &&
    isDetermined(revenueCents) &&
    revenueCents > pricing.budgetCapCents
  ) {
    warnings.push({
      code: "budgetCapExceeded",
      revenueCents,
      budgetCapCents: pricing.budgetCapCents,
    });
  }

  const result: PartialResult = {
    complete: false,
    ...hours,
    staffCostCents,
    staffCostByCategory,
    extraCosts,
    directCostCents,
    overheadCents,
    bufferCents,
    totalCostCents,
    revenueCents,
    directMarginCents,
    directMarginBasisPoints: marginPercent("direct margin %", directMarginCents),
    netMarginCents,
    netMarginBasisPoints,
    // Not applicable without effective hours, whatever revenue is.
    effectiveRateCents: effectiveHours.isZero()
      ? null
      : from([revenueCents], (revenue) =>
          roundRatio("effective rate", Rational.of(revenue).dividedBy(effectiveHours)),
        ),
    marginStatus,
    warnings,
  };
  // Complete when no line misses anything; the cast only narrows what this check proves.
  const everyLine = [
    ...Object.values(lines),
    ...staffCostByCategory.map((line) => line.costPerHourCents),
    result.directMarginBasisPoints,
    result.netMarginBasisPoints,
    result.effectiveRateCents,
  ];
  return missingOf(everyLine).length === 0
    ? ({ ...result, complete: true } as CompleteResult)
    : result;
}
