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

import { FIELD, useFieldProblem } from "./fields";

export type AddMemberDialogProps = {
  /** The assignment the new one reports to; null for the top of the team. */
  reportsTo: string | null;
  managerName: string | null;
  dispatch: (change: Change) => boolean;
  /** Where the dialog renders: the team region. */
  container: HTMLElement | null;
  /** `done` is true once the assignment was added. */
  onClose: (done: boolean) => void;
};

/** A choice's value: `role:<category id>` for an open role, `person:<person id>` for a person. */
type Choice = `role:${string}` | `person:${string}`;

const isChoice = (value: string): value is Choice =>
  value.startsWith("role:") || value.startsWith("person:");

/**
 * "Add to team…" (docs/domain.md, "Changes"): a person of the bench who is not on the team yet, or
 * an open role of a category, and a project role, which starts as the category's name. The rest
 * comes from the domain's defaults: 100% for the project's span, or for the next full month in a
 * team without assignments, and the person's or Config's weekly hours. The form checks itself, in
 * the page's language, instead of the browser's validation.
 */
export function AddMemberDialog({
  reportsTo,
  managerName,
  dispatch,
  onClose,
  container,
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
  const problem = useFieldProblem<"who" | "role">();

  const onTeam = new Set(history.team.map((member) => member.personId));
  const categoryName = new Map(basis.categories.map(({ id, name }) => [id, name]));
  const available = basis.people.filter((person) => person.active && !onTeam.has(person.id));

  function choose(next: Choice | "") {
    setChoice(next);
    problem.clear();
    if (roleTyped || next === "") return;
    const categoryId = next.startsWith("role:")
      ? next.slice("role:".length)
      : basis.people.find((person) => person.id === next.slice("person:".length))?.categoryId;
    setRole(categoryId === undefined ? "" : (categoryName.get(categoryId) ?? ""));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice === "") {
      problem.report("who", t("whoMissing"));
      return;
    }
    if (role.trim() === "") {
      problem.report("role", t("roleMissing"));
      return;
    }
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
    problem.refused("who", store.getState().rejection?.reason ?? "invalid");
  }

  const percent = format.number(1, { style: "percent" });
  const description =
    history.team.length === 0
      ? t("addFirst", { percent })
      : managerName === null
        ? t("addAtTop", { percent })
        : t("addUnder", { manager: managerName, percent });

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
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={whoId} className="text-sm font-medium">
              {t("who")}
            </label>
            <select
              id={whoId}
              value={choice}
              onChange={(event) => {
                const { value } = event.target;
                choose(isChoice(value) ? value : "");
              }}
              className={FIELD}
              {...problem.fieldProps("who")}
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
                          // Screen readers often skip the group's label: the option says it.
                          category: category.name,
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
              maxLength={100}
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setRoleTyped(true);
                problem.clear();
              }}
              className={FIELD}
              {...problem.fieldProps("role")}
            />
          </div>
          {problem.alert}
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
