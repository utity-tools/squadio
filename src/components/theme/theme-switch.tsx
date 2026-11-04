"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Segmented, SegmentedItem } from "@/components/ui/segmented";

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

/**
 * System, light or dark: a segmented radio group, one tab stop. As the APG radio group says, the
 * arrow keys move to the next option and choose it.
 */
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
    <Segmented
      aria-label={t("label")}
      value={preference}
      onValueChange={(value) => {
        if (isThemePreference(value)) writeThemePreference(value);
      }}
    >
      {themePreferences.map((option) => {
        const Icon = icons[option];
        return (
          <SegmentedItem
            key={option}
            value={option}
            aria-label={t(option)}
            title={t(option)}
            // Focus chooses, however quick the key: Radix only does it while an arrow is held down.
            // A theme is always chosen, so unlike the view switch there is no unknown state to skip.
            onFocus={() => {
              if (option !== preference) writeThemePreference(option);
            }}
          >
            <Icon aria-hidden />
          </SegmentedItem>
        );
      })}
    </Segmented>
  );
}
