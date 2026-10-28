"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";

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
import { madridToday } from "@/lib/bench/occupancy";
import type { Change } from "@/lib/scenarios/change";
import { newMember } from "@/lib/scenarios/new-member";
import type { StepRejection } from "@/lib/scenarios/store";

import { FIELD, RejectionText } from "./fields";

export type AddMemberDialogProps = {
  /** The assignment the new one reports to; null for the top of the team. */
  reportsTo: string | null;
  managerName: string | null;
  dispatch: (change: Change) => boolean;
  /** `done` is true once the assignment was added. */
  onClose: (done: boolean) => void;
};

/** A choice's value: `role:<category id>` for an open role, `person:<person id>` for a person. */
type Choice = `role:${string}` | `person:${string}`;

/**
 * "Add to team…" (docs/domain.md, "Changes"): a person of the bench who is not on the team yet, or
 * an open role of a category, and a project role, which starts as the category's name. The rest
 * comes from the domain's defaults: 100% for the project's span, and the person's or Config's
 * weekly hours.
 */
export function AddMemberDialog({
  reportsTo,
  managerName,
  dispatch,
  onClose,
}: AddMemberDialogProps) {
  const t = useTranslations("TeamEditing");
  const format = useFormatter();
  const store = useScenarioStore();
  const { basis, roster, history } = store.getState();
  const whoId = useId();
  const roleId = useId();
  const [choice, setChoice] = useState<Choice | "">("");
  const [role, setRole] = useState("");
  /** Once the role is typed, choosing someone else no longer replaces it. */
  const [roleTyped, setRoleTyped] = useState(false);
  const [refused, setRefused] = useState<StepRejection["reason"] | null>(null);

  const onTeam = new Set(history.team.map((member) => member.personId));
  const categoryName = new Map(basis.categories.map(({ id, name }) => [id, name]));
  const available = basis.people.filter((person) => person.active && !onTeam.has(person.id));

  function choose(next: Choice | "") {
    setChoice(next);
    setRefused(null);
    if (roleTyped || next === "") return;
    const categoryId = next.startsWith("role:")
      ? next.slice("role:".length)
      : basis.people.find((person) => person.id === next.slice("person:".length))?.categoryId;
    setRole(categoryId === undefined ? "" : (categoryName.get(categoryId) ?? ""));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice === "") return;
    const filledBy = choice.startsWith("role:")
      ? { categoryId: choice.slice("role:".length) }
      : { personId: choice.slice("person:".length) };
    const member = newMember({
      id: crypto.randomUUID(),
      projectRole: role.trim(),
      reportsTo,
      filledBy,
      team: history.team,
      roster,
      defaultWeeklyHours: basis.defaultWeeklyHours,
      today: madridToday(new Date()),
    });
    if (dispatch({ type: "add", member })) {
      onClose(true);
      return;
    }
    setRefused(store.getState().rejection?.reason ?? "invalid");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent
        closeLabel={t("close")}
        // Focus goes where the focus manager or `onClose` sends it.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>
              {managerName === null ? t("addAtTop") : t("addUnder", { manager: managerName })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={whoId} className="text-sm font-medium">
              {t("who")}
            </label>
            <select
              id={whoId}
              required
              value={choice}
              onChange={(event) => choose(event.target.value as Choice | "")}
              className={FIELD}
            >
              <option value="" disabled>
                {t("choose")}
              </option>
              <optgroup label={t("openRoles")}>
                {basis.categories.map((category) => (
                  <option key={category.id} value={`role:${category.id}`}>
                    {t("openRoleOf", { category: category.name })}
                  </option>
                ))}
              </optgroup>
              {basis.categories.map((category) => {
                const people = available.filter((person) => person.categoryId === category.id);
                if (people.length === 0) return null;
                return (
                  <optgroup key={category.id} label={category.name}>
                    {people.map((person) => (
                      <option key={person.id} value={`person:${person.id}`}>
                        {t("personOption", {
                          name: person.name,
                          percent: format.number(person.occupancy / 100, { style: "percent" }),
                        })}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={roleId} className="text-sm font-medium">
              {t("role")}
            </label>
            <input
              id={roleId}
              required
              maxLength={100}
              pattern=".*\S.*"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setRoleTyped(true);
                setRefused(null);
              }}
              className={FIELD}
            />
          </div>
          <RejectionText reason={refused} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("addSubmit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
