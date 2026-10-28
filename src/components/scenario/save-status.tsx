"use client";

import { CheckIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import type { SaveStatus as Status } from "@/lib/scenarios/store";

import { useScenarioStore } from "./scenario-editor";

/** What each status says, and what the person can do about it. */
const SHOWN = {
  waiting: { message: "saving", tone: "busy", action: null },
  saving: { message: "saving", tone: "busy", action: null },
  saved: { message: "saved", tone: "done", action: null },
  failed: { message: "failed", tone: "problem", action: "retry" },
  conflict: { message: "conflict", tone: "problem", action: "reload" },
  limit: { message: "limit", tone: "problem", action: null },
  gone: { message: "gone", tone: "problem", action: "reload" },
  refused: { message: "refused", tone: "problem", action: "reload" },
} as const satisfies Record<Status, unknown>;

const ICONS = {
  busy: <LoaderCircleIcon aria-hidden className="size-4 motion-safe:animate-spin" />,
  done: <CheckIcon aria-hidden className="size-4" />,
  problem: <CircleAlertIcon aria-hidden className="size-4 text-status-bad" />,
};

/** The statuses whose pending changes may still be saved. */
const SAVING: ReadonlySet<Status> = new Set(["waiting", "saving", "failed"]);

/** Asks the browser to warn before the page closes while some change may still be saved. */
function useWarnBeforeLeaving(warn: boolean) {
  useEffect(() => {
    if (!warn) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [warn]);
}

/**
 * The header's save state (ADR 0011, "Saving"): nothing until the first change, then saving, saved
 * or why it stopped, with a retry after a failed save and a reload when saving cannot go on. Only
 * the problems are a status region: saving and saved, after every step, would bury the summary's
 * announcement. A save cannot be forced when the page closes, so the browser warns while changes
 * wait to be saved; once saving has stopped, nothing more can be saved, and it does not.
 */
export function SaveStatus() {
  const t = useTranslations("SaveStatus");
  const store = useScenarioStore();
  const status = useStore(store, (state) => state.saveStatus);
  const changed = useStore(store, (state) => state.history.entries.length > 0);
  const unsaved = useStore(store, (state) => state.history.pending.length > 0);
  const container = useRef<HTMLDivElement>(null);
  useWarnBeforeLeaving(unsaved && SAVING.has(status));

  // Before the first change there is nothing to report, yet the region is there to be heard.
  const shown = status === "saved" && !changed ? null : SHOWN[status];
  const text = shown && (
    <>
      {ICONS[shown.tone]}
      {t(shown.message)}
    </>
  );
  const problem = shown?.tone === "problem";

  return (
    // Focusable from script only: Retry leaves the focus here as it goes away.
    <div
      ref={container}
      tabIndex={-1}
      className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground focus-visible:outline-none"
    >
      <p role="status" className="flex items-center gap-1.5">
        {problem && text}
      </p>
      {!problem && text && <p className="flex items-center gap-1.5">{text}</p>}
      {shown?.action === "retry" && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            container.current?.focus();
            store.getState().retry();
          }}
        >
          {t("retry")}
        </Button>
      )}
      {shown?.action === "reload" && (
        <Button variant="outline" size="xs" onClick={() => window.location.reload()}>
          {t("reload")}
        </Button>
      )}
    </div>
  );
}
