"use client";

import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { SCENARIO_PANEL_ID } from "./scenario-shell";

// The scenario's card on the right can be hidden, as GitHub's side panel (ADR 0017). The choice
// lives on <html> as `data-rail`, which the editor's grid reads; it is not stored, and goes with
// the editor.
const EVENT = "squadio:railchange";

export function setRail(shown: boolean) {
  document.documentElement.dataset.rail = shown ? "shown" : "hidden";
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function useRailShown() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.rail !== "hidden",
    () => true,
  );
}

/** Shows or hides the scenario's card, from the bar's end. Only where there is a panel, from md. */
export function RailToggle() {
  const t = useTranslations("ScenarioCard");
  const shown = useRailShown();
  const label = shown ? t("hidePanel") : t("showPanel");

  useEffect(
    () => () => {
      delete document.documentElement.dataset.rail;
    },
    [],
  );

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-expanded={shown}
      aria-controls={SCENARIO_PANEL_ID}
      className="max-md:hidden"
      onClick={() => setRail(!shown)}
    >
      {shown ? <PanelRightCloseIcon aria-hidden /> : <PanelRightOpenIcon aria-hidden />}
    </Button>
  );
}
