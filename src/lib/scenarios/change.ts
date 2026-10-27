import { z } from "zod";

import { hasNationalHolidays } from "@/lib/calendar/calendar";

// docs/domain.md, "Changes": the shape of a change, checked with Zod when it is dispatched
// (ADR 0008, point 5) and again by the Server Action that saves it (ADR 0011). Whether it fits the
// team it applies to is `applyChange`'s job.

/** Cross-field checks run only on otherwise valid input, so one bad field gives one issue. */
const valid = ({ issues }: { issues: readonly unknown[] }) => issues.length === 0;

const id = z.uuid();
/** 1 to 100 characters, not blank. The regex refuses the empty string too, in one issue. */
const projectRole = z.string().max(100).regex(/\S/, "Must not be blank");
/** Positive hours in hundredths, up to a whole week (docs/domain.md, "Validation"). */
const weeklyHours = z
  .number()
  .positive()
  .max(168)
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(String(value)), "At most 2 decimals");
const allocation = z.int().min(0).max(100);
/** A real `YYYY-MM-DD` date in a year the national calendar lists (rule h). */
const calendarDate = z.iso.date().refine(hasNationalHolidays, {
  message: "No national holidays are listed for this year",
  when: valid,
});

/** An assignment as the change model sees it: structure and hours, no names and no money. */
export const memberSchema = z.strictObject({
  id,
  projectRole,
  categoryId: id,
  /** No person: an open role. */
  personId: id.nullable(),
  /** No parent: a root of the team tree. */
  reportsTo: id.nullable(),
  weeklyHours,
  allocation,
  startDate: calendarDate,
  endDate: calendarDate,
});

export type Member = z.infer<typeof memberSchema>;

const editableSchema = z
  .strictObject({
    projectRole,
    personId: id.nullable(),
    weeklyHours,
    allocation,
    startDate: calendarDate,
    endDate: calendarDate,
  })
  .partial()
  // A Server Action payload keeps an explicit `undefined`: it must not blank a field.
  .refine((set) => Object.values(set).every((value) => value !== undefined), {
    message: "A field an edit names must have a value",
    when: valid,
  })
  .refine((set) => Object.keys(set).length > 0, {
    message: "An edit must set at least one field",
    when: valid,
  });

export const changeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("add"), member: memberSchema }),
  z.strictObject({ type: z.literal("move"), id, reportsTo: id.nullable() }),
  z.strictObject({ type: z.literal("remove"), id }),
  z.strictObject({ type: z.literal("edit"), id, set: editableSchema }),
  /** The inverse of a remove: the assignment as it was, and the reports that move back under it. */
  z.strictObject({ type: z.literal("restore"), member: memberSchema, reports: z.array(id) }),
]);

export type Change = z.infer<typeof changeSchema>;
export type MemberEdit = Extract<Change, { type: "edit" }>["set"];

/** Checks the shape of an untrusted change, such as one sent to the Server Action. */
export function parseChange(input: unknown) {
  return changeSchema.safeParse(input);
}
