import { z } from "zod";

import { hasNationalHolidays } from "@/lib/calendar/calendar";

import type { Member, MemberEdit } from "./change";

// docs/domain.md, "Changes": the edit dialog's form. Its fields are text, as the person types
// them; this checks them in the change model's terms and turns what changed into one edit. The
// change model checks the result again when it is dispatched (ADR 0008, point 5).

/** The form's fields. No person: an open role. Dates as `YYYY-MM-DD`, as a date input gives them. */
export type MemberForm = {
  projectRole: string;
  personId: string | null;
  allocation: string;
  weeklyHours: string;
  startDate: string;
  endDate: string;
};

export type FormProblem =
  | "roleMissing"
  | "roleTooLong"
  | "allocationInvalid"
  | "hoursInvalid"
  | "dateInvalid"
  | "dateOutsideCalendar"
  | "datesOrder";

export type FormResult =
  | { ok: true; set: MemberEdit | null }
  | { ok: false; field: keyof MemberForm; problem: FormProblem };

/** Hours as the form shows them, with the page's decimal mark. */
export function hoursText(hours: number, decimal: string): string {
  return String(hours).replace(".", decimal);
}

/** The form for an assignment, its hours written with the page's decimal mark. */
export function formOf(member: Member, decimal: string): MemberForm {
  return {
    projectRole: member.projectRole,
    personId: member.personId,
    allocation: String(member.allocation),
    weeklyHours: hoursText(member.weeklyHours, decimal),
    startDate: member.startDate,
    endDate: member.endDate,
  };
}

/**
 * Weekly hours as typed, with a comma or a point and at most two decimals: above 0 and up to a
 * whole week (docs/domain.md, "Validation"). Null when they are not.
 */
export function parseWeeklyHours(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(`${match[1]}.${match[2] ?? "0"}`);
  return hours > 0 && hours <= 168 ? hours : null;
}

const isDate = (text: string) => z.iso.date().safeParse(text).success;

/** The form checked, and the edit of what changed; `set` is null when nothing did. */
export function editFromForm(member: Member, form: MemberForm): FormResult {
  const fail = (field: keyof MemberForm, problem: FormProblem): FormResult => ({
    ok: false,
    field,
    problem,
  });

  const projectRole = form.projectRole.trim();
  if (projectRole === "") return fail("projectRole", "roleMissing");
  if (projectRole.length > 100) return fail("projectRole", "roleTooLong");
  const allocation = /^\d{1,3}$/.test(form.allocation.trim()) ? Number(form.allocation) : NaN;
  if (!(allocation >= 0 && allocation <= 100)) return fail("allocation", "allocationInvalid");
  const weeklyHours = parseWeeklyHours(form.weeklyHours);
  if (weeklyHours === null) return fail("weeklyHours", "hoursInvalid");
  for (const field of ["startDate", "endDate"] as const) {
    if (!isDate(form[field])) return fail(field, "dateInvalid");
    if (!hasNationalHolidays(form[field])) return fail(field, "dateOutsideCalendar");
  }
  if (form.startDate > form.endDate) return fail("endDate", "datesOrder");

  const set: MemberEdit = {};
  if (projectRole !== member.projectRole) set.projectRole = projectRole;
  if (allocation !== member.allocation) set.allocation = allocation;
  if (form.startDate !== member.startDate) set.startDate = form.startDate;
  if (form.endDate !== member.endDate) set.endDate = form.endDate;
  if (form.personId !== member.personId) {
    set.personId = form.personId;
    // Always with the hours: an edit that places a person without them copies the person's
    // (rule a), which would replace hours typed back to the seat's old value.
    set.weeklyHours = weeklyHours;
  } else if (weeklyHours !== member.weeklyHours) {
    set.weeklyHours = weeklyHours;
  }
  return { ok: true, set: Object.keys(set).length === 0 ? null : set };
}
