"use client";

import { useTranslations } from "next-intl";

import type { StepRejection } from "@/lib/scenarios/store";

/** A form field in the team's dialogs, sized like the buttons beside it. */
export const FIELD =
  "h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs placeholder:text-muted-foreground dark:bg-input/30";

/**
 * Why the store refused a dialog's change, in the store's own words (the announcer's reasons). It
 * is announced as an alert, since the page's live region is hidden behind the modal dialog.
 */
export function RejectionText({ reason }: { reason: StepRejection["reason"] | null }) {
  const t = useTranslations("ScenarioAnnouncer");
  if (reason === null) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t("rejected", { action: "change", reason: t(`reasons.${reason}`) })}
    </p>
  );
}
