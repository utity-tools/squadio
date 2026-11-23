import { z } from "zod";

// docs/domain.md, "What a revision holds"; ADR 0013 and ADR 0010 (2026-11-23). A revision is one
// JSON snapshot in two parts: the open part, which everyone in the organization reads, and the
// restricted part, which only rate access reads. Each carries a schema version, and a row once
// written is never rewritten, so every version stays readable as it was stored.
//
// These schemas check shape, not the engine's rules: a revision made under an older calendar or
// rules version must still parse, so no date is checked against today's national calendar.

const id = z.string().min(1);
const name = z.string().min(1);
const isoDate = z.iso.date();
const hours = z.number().min(0);
const unique = (values: readonly string[]) => new Set(values).size === values.length;

// The open part. Strict at every level and without a money field, so no amount can be added to it
// by mistake: a revision's money lives only in the restricted part (ADR 0005, ADR 0010).

const openAssignmentSchema = z
  .object({
    id,
    category: z.object({ id, name }).strict(),
    /** Null for an open role. */
    person: z.object({ id, name }).strict().nullable(),
    projectRole: z.string(),
    reportsTo: id.nullable(),
    weeklyHours: z.number().positive(),
    allocation: z.int().min(0).max(100),
    startDate: isoDate,
    endDate: isoDate,
    nominalHours: hours,
    effectiveHours: hours,
  })
  .strict();

/** A week in which an assignment's person was above 100% the day the revision was made (rule c). */
const overAllocatedWeekSchema = z
  .object({
    start: isoDate,
    end: isoDate,
    /** The load, rounded half up. */
    percent: z.int().min(0),
    /** Above 100% though it rounds to 100%: shown as «>100 %». */
    aboveHundred: z.boolean(),
    /** The other projects whose chosen scenarios added to it. */
    projects: z.array(z.object({ id, name }).strict()),
  })
  .strict();

export const openPartSchema = z
  .object({
    schemaVersion: z.literal(1),
    rulesVersion: z.int().min(1),
    scenarioName: name,
    pricingModel: z.enum(["fixed", "timeAndMaterials"]),
    /** In the scenario's order, with the names they had. */
    team: z.array(openAssignmentSchema),
    hours: z.object({ nominal: hours, effective: hours }).strict(),
    /** The assignments whose person was over-allocated, in the team's order. */
    overAllocation: z.array(
      z.object({ assignmentId: id, weeks: z.array(overAllocatedWeekSchema).min(1) }).strict(),
    ),
  })
  .strict()
  .refine(({ team }) => unique(team.map((member) => member.id)), {
    message: "Assignment ids repeat",
    path: ["team"],
  })
  .refine(
    ({ team, overAllocation }) =>
      unique(overAllocation.map((entry) => entry.assignmentId)) &&
      overAllocation.every((entry) => team.some((member) => member.id === entry.assignmentId)),
    {
      message: "Over-allocation of an assignment outside the team, or twice",
      path: ["overAllocation"],
    },
  );

// The restricted part: amounts in integer cents and percentages in basis points, safe integers as
// in TypeScript (ADR 0010, 2026-11-23).

const cents = z.int();
const basisPoints = z.int();

const missingSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("missingRate"), categoryIds: z.array(id).min(1) }).strict(),
  z.object({ code: z.literal("missingPrice") }).strict(),
  z.object({ code: z.literal("missingPeriod") }).strict(),
]);

/** A line missing data leaves without an amount, with everything it misses (partial results). */
const undeterminedSchema = z.object({ undetermined: z.array(missingSchema).min(1) }).strict();
const lineSchema = z.union([cents, undeterminedSchema]);
/** A margin % or an effective rate: null where it does not apply. */
const ratioSchema = z.union([z.int(), z.null(), undeterminedSchema]);

const rateSchema = z
  .object({
    categoryId: id,
    sellRateCents: cents.min(0),
    cost: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("annual"), fullyLoadedCents: cents.min(0) }).strict(),
      z.object({ kind: z.literal("manual"), costPerHourCents: cents.min(0) }).strict(),
    ]),
  })
  .strict();

const label = z.string().optional();

const extraCostSchema = z.discriminatedUnion("kind", [
  z.object({ id, label, kind: z.literal("fixed"), amountCents: cents.min(0) }).strict(),
  z
    .object({
      id,
      label,
      kind: z.literal("recurring"),
      /** Per month. */
      amountCents: cents.min(0),
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
    })
    .strict(),
  z
    .object({
      id,
      label,
      kind: z.literal("percentage"),
      basisPoints: basisPoints.min(0),
      base: z.enum(["staffCost", "revenue"]),
    })
    .strict(),
]);

const warningSchema = z.union([
  missingSchema,
  z
    .object({
      code: z.literal("budgetCapExceeded"),
      revenueCents: cents,
      budgetCapCents: cents,
    })
    .strict(),
]);

/** Every result line of the engine; hours are in the open part, and the margin status in neither. */
const resultSchema = z
  .object({
    complete: z.boolean(),
    staffCostCents: lineSchema,
    staffCostByCategory: z.array(
      z
        .object({
          categoryId: id,
          effectiveHours: hours,
          costPerHourCents: lineSchema,
          costCents: lineSchema,
        })
        .strict(),
    ),
    extraCosts: z.array(z.object({ id, amountCents: lineSchema }).strict()),
    directCostCents: lineSchema,
    overheadCents: lineSchema,
    bufferCents: lineSchema,
    totalCostCents: lineSchema,
    revenueCents: lineSchema,
    directMarginCents: lineSchema,
    directMarginBasisPoints: ratioSchema,
    netMarginCents: lineSchema,
    netMarginBasisPoints: ratioSchema,
    effectiveRateCents: ratioSchema,
    warnings: z.array(warningSchema),
  })
  .strict();

export const restrictedPartSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** The rate of each category the team uses, in the team's order. */
    rates: z
      .array(rateSchema)
      .refine((rates) => unique(rates.map((rate) => rate.categoryId)), "Category rates repeat"),
    /** In effect: the project's overrides, or else the organization's (rule b). */
    costSettings: z
      .object({
        overheadBasisPoints: basisPoints.min(0),
        bufferBasisPoints: basisPoints.min(0),
        netAnnualHours: z.number().positive(),
        calendarWorkingHours: z.number().positive(),
      })
      .strict(),
    /** The fixed price, or the budget cap in T&M (rule e); absent when not set. */
    pricing: z.discriminatedUnion("model", [
      z.object({ model: z.literal("fixed"), priceCents: cents.min(1).optional() }).strict(),
      z
        .object({ model: z.literal("timeAndMaterials"), budgetCapCents: cents.min(1).optional() })
        .strict(),
    ]),
    /** Here, though a project's is open: in a revision it only prorates recurring costs. */
    plannedPeriod: z.object({ start: isoDate, end: isoDate }).strict().nullable(),
    extraCosts: z.array(extraCostSchema),
    result: resultSchema,
  })
  .strict();

export type OpenPart = z.infer<typeof openPartSchema>;
export type RestrictedPart = z.infer<typeof restrictedPartSchema>;
export type RevisionResultLines = RestrictedPart["result"];

/** A revision's snapshot: both parts, as they are stored. */
export type RevisionSnapshot = { open: OpenPart; restricted: RestrictedPart };
