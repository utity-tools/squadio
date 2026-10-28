"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState } from "react";

import { useScenarioStore } from "@/components/scenario/scenario-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Change } from "@/lib/scenarios/change";
import { type MemberForm, editFromForm, formOf, hoursText } from "@/lib/scenarios/member-form";
import type { StepRejection } from "@/lib/scenarios/store";

import { FIELD, useFieldProblem } from "./fields";

export type EditMemberDialogProps = {
  id: string;
  name: string;
  dispatch: (change: Change) => boolean;
  /** Where the dialog renders: the team region. */
  container: HTMLElement | null;
  /** `done` is true once the edit was made; false when cancelled or nothing changed. */
  onClose: (done: boolean) => void;
};

/** The value of "an open role" in the person field: no person id is empty. */
const OPEN_ROLE = "";

/** The field a refusal of the change model is about; null for one about no field. */
function fieldOf(reason: StepRejection["reason"]): keyof MemberForm | null {
  if (
    reason === "duplicate-person" ||
    reason === "inactive-person" ||
    reason === "wrong-category"
  ) {
    return "personId";
  }
  return reason === "impossible-dates" ? "endDate" : null;
}

/** The decimal mark of a locale's numbers. */
function decimalMark(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * "Edit…" (docs/domain.md, "Changes"): the project role, who fills the role (a person of its
 * category not on the team yet, or nobody), allocation, weekly hours and dates. The category is not
 * edited. Choosing a person writes their weekly hours in the form (rule a); choosing nobody, or the
 * person it had, writes back the seat's. They can still be changed. What changed is saved as one
 * edit; nothing changed, nothing is saved.
 */
export function EditMemberDialog({
  id,
  name,
  dispatch,
  onClose,
  container,
}: EditMemberDialogProps) {
  const t = useTranslations("TeamEditing");
  const format = useFormatter();
  const decimal = decimalMark(useLocale());
  const store = useScenarioStore();
  const { basis, history } = store.getState();
  const member = history.team.find((candidate) => candidate.id === id);
  const [form, setForm] = useState<MemberForm | null>(() =>
    member ? formOf(member, decimal) : null,
  );
  const problem = useFieldProblem<keyof MemberForm>();
  const ids = {
    projectRole: useId(),
    personId: useId(),
    allocation: useId(),
    weeklyHours: useId(),
    startDate: useId(),
    endDate: useId(),
  };
  // The assignment left the team while the dialog was opening: there is nothing to edit.
  useEffect(() => {
    if (!member) onClose(false);
  }, [member, onClose]);
  if (!member || !form) return null;

  const onTeam = new Set(history.team.map((other) => other.personId));
  // Its own person stays offered even if they were deactivated or moved to another category since
  // (docs/domain.md, "Changes"); anyone else must be of its category, active and not on the team.
  const people = basis.people.filter(
    (person) =>
      person.id === member.personId ||
      (person.categoryId === member.categoryId && person.active && !onTeam.has(person.id)),
  );

  function change(patch: Partial<MemberForm>) {
    setForm((last) => last && { ...last, ...patch });
    problem.clear();
  }

  function choosePerson(value: string) {
    if (!member) return;
    const person = basis.people.find((candidate) => candidate.id === value);
    // Rule a: a new person brings their weekly hours; nobody, or the person it had, the seat's.
    const hours = person && person.id !== member.personId ? person.weeklyHours : member.weeklyHours;
    change({ personId: person?.id ?? null, weeklyHours: hoursText(hours, decimal) });
  }

  /** Shows a problem against its field, and takes the keyboard there. */
  function report(field: keyof MemberForm, message: string) {
    problem.report(field, message);
    document.getElementById(ids[field])?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || !form) return;
    const result = editFromForm(member, form);
    if (!result.ok) {
      report(result.field, t(`problems.${result.problem}`, { field: result.field }));
      return;
    }
    // Nothing changed: no step, so focus goes back where the dialog came from, as on cancel.
    if (result.set === null) {
      onClose(false);
      return;
    }
    if (dispatch({ type: "edit", id, set: result.set })) {
      onClose(true);
      return;
    }
    const reason = store.getState().rejection?.reason ?? "invalid";
    problem.refused(fieldOf(reason), reason);
  }

  const label = (field: keyof MemberForm, text: string) => (
    <label htmlFor={ids[field]} className="text-sm font-medium">
      {text}
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent
        closeLabel={t("close")}
        container={container}
        // Focus goes where the focus manager or `onClose` sends it.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("editTitle", { name })}</DialogTitle>
            <DialogDescription>{t("editHint")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {label("projectRole", t("role"))}
            <input
              id={ids.projectRole}
              maxLength={100}
              value={form.projectRole}
              onChange={(event) => change({ projectRole: event.target.value })}
              className={FIELD}
              {...problem.fieldProps("projectRole")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {label("personId", t("filledBy"))}
            <select
              id={ids.personId}
              value={form.personId ?? OPEN_ROLE}
              onChange={(event) => choosePerson(event.target.value)}
              className={FIELD}
              {...problem.fieldProps("personId")}
            >
              <option value={OPEN_ROLE}>{t("openRoleChoice")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {/* Every option shares the role's category, so it is left out. */}
                  {t("samePersonOption", {
                    name: person.name,
                    active: String(person.active),
                    percent: format.number(person.occupancy / 100, { style: "percent" }),
                  })}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              {label("allocation", t("allocation"))}
              <input
                id={ids.allocation}
                inputMode="numeric"
                value={form.allocation}
                onChange={(event) => change({ allocation: event.target.value })}
                className={FIELD}
                {...problem.fieldProps("allocation")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {label("weeklyHours", t("weeklyHours"))}
              <input
                id={ids.weeklyHours}
                inputMode="decimal"
                value={form.weeklyHours}
                onChange={(event) => change({ weeklyHours: event.target.value })}
                className={FIELD}
                {...problem.fieldProps("weeklyHours")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {label("startDate", t("startDate"))}
              <input
                id={ids.startDate}
                type="date"
                value={form.startDate}
                onChange={(event) => change({ startDate: event.target.value })}
                className={FIELD}
                {...problem.fieldProps("startDate")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {label("endDate", t("endDate"))}
              <input
                id={ids.endDate}
                type="date"
                value={form.endDate}
                onChange={(event) => change({ endDate: event.target.value })}
                className={FIELD}
                {...problem.fieldProps("endDate")}
              />
            </div>
          </div>
          {problem.alert}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("editSubmit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
