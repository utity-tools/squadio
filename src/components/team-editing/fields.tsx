"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { controlClassName } from "@/components/ui/field";
import type { StepRejection } from "@/lib/scenarios/store";

/** A form field in the team's dialogs: the design system's control, sized like its buttons. */
export const FIELD = controlClassName();

/** A field for a number, right-aligned in mono so the digits line up. */
export const NUMBER_FIELD = controlClassName({ numeric: true });

/** What is wrong with a dialog's form, and the field it is about. */
export type FieldProblem<Field extends string> = { field: Field | null; message: string };

/**
 * A dialog's error: which field it is about, the props that tie that field to it, and the alert
 * that says it. The page's live region is hidden behind the modal dialog, so the dialog says it
 * itself; each attempt is a new alert, so a repeated refusal is heard again.
 */
export function useFieldProblem<Field extends string>() {
  const t = useTranslations("ScenarioAnnouncer");
  const id = useId();
  const [problem, setProblem] = useState<FieldProblem<Field> | null>(null);
  const [attempt, setAttempt] = useState(0);

  return {
    /** Shows `message` against `field`. */
    report: (field: Field, message: string) => {
      setProblem({ field, message });
      setAttempt((last) => last + 1);
    },
    /** Shows why the store refused the change, in its own words, against `field` if it has one. */
    refused: (field: Field | null, reason: StepRejection["reason"]) => {
      setProblem({
        field,
        message: t("rejected", { action: "change", reason: t(`reasons.${reason}`) }),
      });
      setAttempt((last) => last + 1);
    },
    clear: () => setProblem(null),
    /** `aria-invalid` and `aria-describedby` for a field, while the problem is about it. */
    fieldProps: (field: Field) =>
      problem?.field === field ? { "aria-invalid": true, "aria-describedby": id } : {},
    alert: problem && (
      <p key={attempt} id={id} role="alert" className="text-[13px] text-status-bad-text">
        {problem.message}
      </p>
    ),
  };
}
