"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  THEME_CHANGE_EVENT,
  type ThemePreference,
  isThemePreference,
  readThemePreference,
  themePreferences,
  writeThemePreference,
} from "./theme";

const icons = { system: Monitor, light: Sun, dark: Moon } satisfies Record<
  ThemePreference,
  unknown
>;

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

/** System, light or dark: a segmented radio group, one tab stop moved with the arrow keys. */
export function ThemeSwitch() {
  const t = useTranslations("Theme");
  // The server cannot read the cookie without making every page dynamic: it renders "system"
  // and the stored preference shows once hydrated. The page itself never flashes.
  const preference = useSyncExternalStore(
    subscribe,
    () => readThemePreference(document.cookie),
    () => "system" as const,
  );

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label={t("label")}
      value={preference}
      onValueChange={(value) => {
        // Clicking the chosen option again sends "": a theme always stays chosen.
        if (isThemePreference(value)) writeThemePreference(value);
      }}
    >
      {themePreferences.map((option) => {
        const Icon = icons[option];
        return (
          <ToggleGroupItem
            key={option}
            value={option}
            aria-label={t(option)}
            title={t(option)}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Icon aria-hidden />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
