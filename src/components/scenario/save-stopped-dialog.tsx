"use client";

import { ClockIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";
import type { SaveStatus } from "@/lib/scenarios/store";

/** The stopped saves that interrupt, and whether the person may go on without saving. */
const INTERRUPTING = {
  conflict: { icon: <RefreshCwIcon />, tone: "warn", dismissible: false },
  gone: { icon: <Trash2Icon />, tone: "muted", dismissible: false },
  limit: { icon: <ClockIcon />, tone: "warn", dismissible: true },
} as const;

type Interrupting = keyof typeof INTERRUPTING;

function interrupts(status: SaveStatus): status is Interrupting {
  return Object.hasOwn(INTERRUPTING, status);
}

/**
 * The window that interrupts when saving stops for good (Errors board, section 4), beside the
 * header's status, which keeps saying why. A conflict has one safe way on, a reload; a deleted
 * copy, the app's Inicio (`/home`, not the landing at `/`) or a new demo. Neither closes with
 * Escape or an outside click, which would leave edits that are never saved. The day's limit lets
 * the person keep looking, and does not come back.
 */
export function SaveStoppedDialog({ status }: { status: SaveStatus }) {
  const t = useTranslations("SaveStatus");
  const tDialog = useTranslations("SaveDialog");
  const [dismissed, setDismissed] = useState(false);
  if (!interrupts(status)) return null;
  const { icon, tone, dismissible } = INTERRUPTING[status];

  return (
    <AlertDialog
      open={!(dismissible && dismissed)}
      onOpenChange={(open) => {
        if (!open && dismissible) setDismissed(true);
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
        }}
      >
        <AlertDialogHeader icon={icon} tone={tone}>
          <AlertDialogTitle>{t(status)}</AlertDialogTitle>
          <AlertDialogDescription>{tDialog(status)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {status === "conflict" && (
            <AlertDialogAction onClick={() => window.location.reload()}>
              {t("reload")}
            </AlertDialogAction>
          )}
          {status === "gone" && (
            <>
              <AlertDialogCancel asChild>
                <Link href="/home">{tDialog("home")}</Link>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{tDialog("demo")}</Link>
              </AlertDialogAction>
            </>
          )}
          {status === "limit" && <AlertDialogAction>{tDialog("keepLooking")}</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
