"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";

import { useScenarioStore } from "@/components/scenario/scenario-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Change } from "@/lib/scenarios/change";
import { moveTargets } from "@/lib/scenarios/move-targets";
import type { StepRejection } from "@/lib/scenarios/store";

import { FIELD, RejectionText } from "./fields";

export type MoveMemberDialogProps = {
  id: string;
  nameOf: (id: string) => string;
  dispatch: (change: Change) => boolean;
  /** `done` is true once the assignment moved. */
  onClose: (done: boolean) => void;
};

/** The value of "no one", the top of the team: no assignment id is empty. */
const TOP = "";

/** "Move to…": who the assignment reports to, among the moves the change model accepts. */
export function MoveMemberDialog({ id, nameOf, dispatch, onClose }: MoveMemberDialogProps) {
  const t = useTranslations("TeamEditing");
  const store = useScenarioStore();
  const fieldId = useId();
  const { managers, root } = moveTargets(store.getState().history.team, id);
  const [reportsTo, setReportsTo] = useState(root ? TOP : (managers[0] ?? TOP));
  const [refused, setRefused] = useState<StepRejection["reason"] | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dispatch({ type: "move", id, reportsTo: reportsTo === TOP ? null : reportsTo })) {
      onClose(true);
      return;
    }
    setRefused(store.getState().rejection?.reason ?? "invalid");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent
        closeLabel={t("close")}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("moveTitle", { name: nameOf(id) })}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="text-sm font-medium">
              {t("reportsTo")}
            </label>
            <select
              id={fieldId}
              value={reportsTo}
              onChange={(event) => {
                setReportsTo(event.target.value);
                setRefused(null);
              }}
              className={FIELD}
            >
              {root && <option value={TOP}>{t("nobody")}</option>}
              {managers.map((manager) => (
                <option key={manager} value={manager}>
                  {nameOf(manager)}
                </option>
              ))}
            </select>
          </div>
          <RejectionText reason={refused} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("moveSubmit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
