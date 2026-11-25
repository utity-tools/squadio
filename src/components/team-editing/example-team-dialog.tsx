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
import {
  EXAMPLE_TEAMS,
  OMIT,
  type ExampleRole,
  type ExampleTeam,
  type RoleChoices,
  exampleChanges,
  fullTimeEquivalents,
  matchCategories,
} from "@/lib/scenarios/example-teams";
import type { Change } from "@/lib/scenarios/change";
import { cn } from "@/lib/utils";

import { FIELD, useFieldProblem } from "./fields";

export type ExampleTeamDialogProps = {
  /** Applies the example's adds as one step (the store's `dispatchAll`). */
  dispatchAll: (changes: readonly Change[]) => boolean;
  /** Where the dialog renders: the team region. */
  container: HTMLElement | null;
  /** `done` is true once the example was added. */
  onClose: (done: boolean) => void;
};

/**
 * «Partir de un ejemplo» (docs/domain.md, "Starting from an example team", board 15): one of the
 * example teams, each role matched to one of the organization's categories or left out, added as
 * open roles in one step. It shows structure and allocation only, never money, so it needs no rate
 * access. The form checks itself, in the page's language, like the other team dialogs.
 */
export function ExampleTeamDialog({ dispatchAll, container, onClose }: ExampleTeamDialogProps) {
  const t = useTranslations("ExampleTeams");
  const tEditing = useTranslations("TeamEditing");
  const format = useFormatter();
  const store = useScenarioStore();
  const { basis } = store.getState();
  const formId = useId();
  // The web application, the domain's middle-sized example, is chosen first.
  const [team, setTeam] = useState<ExampleTeam>(() => webApp());
  const [choices, setChoices] = useState<RoleChoices>(() =>
    matchCategories(team, basis.categories),
  );
  const problem = useFieldProblem<string>();
  const selectId = (key: string) => `${formId}-${key}`;

  function pick(next: ExampleTeam) {
    setTeam(next);
    setChoices(matchCategories(next, basis.categories));
    problem.clear();
  }

  const matched = matchCategories(team, basis.categories);
  const labels = roleLabels(team, (role, number) => t("repeatedRole", { role, number }));
  const kept = team.roles.filter(({ key }) => choices[key] !== OMIT).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = exampleChanges(team, choices, {
      team: store.getState().history.team,
      defaultWeeklyHours: basis.defaultWeeklyHours,
      today: madridToday(new Date()),
      plannedPeriod: basis.project.plannedPeriod,
      newId: () => crypto.randomUUID(),
    });
    if (!result.ok) {
      if (result.reason === "not-empty") {
        problem.report(null, t("problems.notEmpty"));
        return;
      }
      const first = result.reason === "unchosen" ? result.roles[0] : team.roles[0]?.key;
      if (first === undefined) return;
      problem.report(
        first,
        result.reason === "unchosen" ? t("problems.unchosen") : t("problems.empty"),
      );
      document.getElementById(selectId(first))?.focus();
      return;
    }
    if (dispatchAll(result.changes)) {
      onClose(true);
      return;
    }
    problem.refused(null, store.getState().rejection?.reason ?? "invalid");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent
        size="lg"
        closeLabel={tEditing("close")}
        container={container}
        // Focus goes where the focus manager or `onClose` sends it.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("examples")}</legend>
              {EXAMPLE_TEAMS.map((example) => {
                const selected = example.id === team.id;
                return (
                  <label
                    key={example.id}
                    className={cn(
                      "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring",
                      selected && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-example`}
                      value={example.id}
                      checked={selected}
                      onChange={() => pick(example)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{t(`teams.${example.id}.name`)}</span>
                      <span className="text-muted-foreground">
                        {t(`teams.${example.id}.summary`)}
                      </span>
                      <span className="text-xs">
                        {t("size", {
                          roles: example.roles.length,
                          people: format.number(fullTimeEquivalents(example), {
                            maximumFractionDigits: 1,
                          }),
                        })}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <div className="flex min-w-0 flex-col gap-3">
              <Structure team={team} />
              <table className="w-full text-sm">
                <caption className="sr-only">{t("rolesCaption")}</caption>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-1.5 pe-2 font-medium">
                      {t("columns.role")}
                    </th>
                    <th scope="col" className="py-1.5 pe-2 text-end font-medium">
                      {t("columns.allocation")}
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                      {t("columns.category")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {team.roles.map((role) => (
                    <RoleRow
                      key={`${team.id}-${role.key}`}
                      role={role}
                      label={labels.get(role.key) ?? role.projectRole}
                      selectId={selectId(role.key)}
                      choice={choices[role.key] ?? null}
                      matched={matched[role.key] ?? null}
                      categories={basis.categories}
                      fieldProps={problem.fieldProps(role.key)}
                      onChoose={(value) => {
                        setChoices((last) => ({ ...last, [role.key]: value }));
                        problem.clear();
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {basis.project.plannedPeriod ? t("datesPlanned") : t("datesNextMonth")} {t("undoNote")}
          </p>
          {problem.alert}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              {tEditing("cancel")}
            </Button>
            <Button type="submit">{t("submit", { count: kept })}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The web application example, which always exists. */
function webApp(): ExampleTeam {
  const found = EXAMPLE_TEAMS.find(({ id }) => id === "web-app") ?? EXAMPLE_TEAMS[0];
  if (!found) throw new Error("No example teams");
  return found;
}

/**
 * Each role's name in the table: its project role, numbered when the example repeats it (two
 * Senior Developers), so every select has a name of its own.
 */
function roleLabels(
  team: ExampleTeam,
  numbered: (role: string, number: number) => string,
): Map<string, string> {
  const seen = new Map<string, number>();
  const repeated = (name: string) =>
    team.roles.filter(({ projectRole }) => projectRole === name).length > 1;
  return new Map(
    team.roles.map(({ key, projectRole }) => {
      const number = (seen.get(projectRole) ?? 0) + 1;
      seen.set(projectRole, number);
      return [key, repeated(projectRole) ? numbered(projectRole, number) : projectRole];
    }),
  );
}

type RoleRowProps = {
  role: ExampleRole;
  /** The role's name, numbered when the example repeats it. */
  label: string;
  selectId: string;
  choice: string | null;
  /** The category chosen first, by name; none says the organization lacks one. */
  matched: string | null;
  categories: readonly { id: string; name: string }[];
  /** While a problem is about this role: `aria-invalid` and the alert's id. */
  fieldProps: { "aria-invalid"?: boolean; "aria-describedby"?: string };
  onChoose: (value: string) => void;
};

function RoleRow({
  role,
  label,
  selectId,
  choice,
  matched,
  categories,
  fieldProps,
  onChoose,
}: RoleRowProps) {
  const t = useTranslations("ExampleTeams");
  const format = useFormatter();
  const hintId = `${selectId}-hint`;
  return (
    <tr className="border-b align-top">
      <th scope="row" className="py-2 pe-2 text-left font-normal">
        <label htmlFor={selectId}>{label}</label>
      </th>
      <td className="py-2 pe-2 text-end font-mono tabular-nums">
        {format.number(role.allocation / 100, { style: "percent" })}
      </td>
      <td className="py-2">
        <select
          id={selectId}
          value={choice ?? ""}
          onChange={(event) => onChoose(event.target.value)}
          className={FIELD}
          {...fieldProps}
          // The hint that the organization lacks the role's category stays read with the problem.
          aria-describedby={
            [matched === null ? hintId : null, fieldProps["aria-describedby"]]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          <option value="" disabled>
            {t("chooseCategory")}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
          <option value={OMIT}>{t("omit")}</option>
        </select>
        {matched === null && (
          <p id={hintId} className="mt-1 text-xs text-muted-foreground">
            {t("noMatch", { role: role.projectRole })}
          </p>
        )}
      </td>
    </tr>
  );
}

/** The example's tree as nested lists: who reports to whom, with each role's allocation. */
function Structure({ team }: { team: ExampleTeam }) {
  const t = useTranslations("ExampleTeams");
  const format = useFormatter();
  const branch = (parent: string | null) => {
    const roles = team.roles.filter(({ reportsTo }) => reportsTo === parent);
    if (roles.length === 0) return null;
    return (
      <ul className={cn("flex flex-col gap-1.5", parent !== null && "ms-4 mt-1.5 border-s ps-3")}>
        {roles.map((role) => (
          <li key={role.key}>
            <span className="inline-flex gap-2 rounded-md border border-dashed bg-background px-2 py-1 text-[13px]">
              {role.projectRole}
              <span className="font-mono text-muted-foreground tabular-nums">
                {format.number(role.allocation / 100, { style: "percent" })}
              </span>
            </span>
            {branch(role.key)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <div className="rounded-lg bg-muted p-3">
      <h3 className="mb-2 text-sm font-medium">{t("structure")}</h3>
      {branch(null)}
    </div>
  );
}
