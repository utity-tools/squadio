"use client";

import { Redo2Icon, Undo2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { canRedo, canUndo } from "@/lib/scenarios/history";
import { historyShortcut } from "@/lib/scenarios/history-shortcut";

import { useScenarioStore } from "./scenario-editor";

const subscribeNever = () => () => {};

/** Whether the browser runs on Apple's platforms, where the shortcuts use ⌘. */
function isApple() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Native and ARIA text fields, where Ctrl+Z belongs to the field, and dialogs, whose form would
 * otherwise act on a team that changed under it.
 */
const TEXT_FIELDS =
  "input, textarea, select, [role=textbox], [role=combobox], [role=searchbox], [role=dialog]";

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest(TEXT_FIELDS) !== null)
  );
}

/**
 * Undo and redo in the header, with ⌘Z and ⇧⌘Z (Ctrl elsewhere) anywhere on the page but in a text
 * field (canvas brief, "Undo / redo"). A button that has nothing to do stays focusable, marked
 * `aria-disabled`, so undoing the last change does not drop the focus.
 */
export function HistoryControls() {
  const t = useTranslations("ScenarioHistory");
  const store = useScenarioStore();
  const history = useStore(store, (state) => state.history);
  // A chosen scenario's team cannot be edited, so its history cannot be stepped through either.
  const chosen = useStore(store, (state) => state.basis.scenario.chosen);
  // The server does not know the platform: it renders Ctrl, and a Mac shows ⌘ once hydrated.
  const apple = useSyncExternalStore(subscribeNever, isApple, () => false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditable(event.target)) return;
      const action = historyShortcut(event, apple);
      if (!action) return;
      event.preventDefault();
      store.getState()[action]();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [store, apple]);

  const buttons = [
    {
      action: "undo",
      enabled: !chosen && canUndo(history),
      Icon: Undo2Icon,
      shortcut: apple ? "⌘Z" : "Ctrl+Z",
      keys: apple ? "Meta+Z" : "Control+Z",
    },
    {
      action: "redo",
      enabled: !chosen && canRedo(history),
      Icon: Redo2Icon,
      shortcut: apple ? "⇧⌘Z" : "Ctrl+Shift+Z",
      keys: apple ? "Shift+Meta+Z" : "Control+Shift+Z Control+Y",
    },
  ] as const;

  return (
    <div role="group" aria-label={t("label")} className="flex items-center gap-1">
      {buttons.map(({ action, enabled, Icon, shortcut, keys }) => (
        <Button
          key={action}
          variant="ghost"
          size="icon-sm"
          aria-label={t(action)}
          aria-keyshortcuts={keys}
          aria-disabled={!enabled}
          title={t(`${action}Title`, { shortcut })}
          onClick={() => {
            if (enabled) store.getState()[action]();
          }}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </div>
  );
}
