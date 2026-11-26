"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * A refusal under a button of the editor's bar (ADR 0017): it floats over the page, so the bar
 * never moves, and it stays until the next action or until it is dismissed, so it is read at one's
 * own pace (WCAG 2.2.1). Only a success note goes on its own.
 */
export function BarRefusal({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const t = useTranslations("ScenarioCard");
  return (
    <span className="absolute end-0 top-full z-30 mt-2 flex w-max max-w-72 items-start gap-1 rounded-md border bg-popover py-1 ps-2.5 pe-1 text-start text-[13px] text-status-bad-text shadow-md">
      <span role="alert" className="py-0.5">
        {children}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("dismiss")}
        title={t("dismiss")}
        className="text-muted-foreground"
        onClick={onDismiss}
      >
        <XIcon aria-hidden />
      </Button>
    </span>
  );
}
