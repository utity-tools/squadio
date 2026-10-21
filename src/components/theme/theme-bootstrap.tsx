"use client";

import { useEffect } from "react";

import { THEME_CHANGE_EVENT, THEME_COOKIE, bootstrapTheme } from "./theme";

/**
 * Starts the theme when the inline script in <head> did not run: Next.js renders a 404 on the
 * client, and scripts React inserts never execute. Everywhere else the script already ran.
 */
export function ThemeBootstrap() {
  useEffect(() => {
    if (!document.documentElement.dataset.theme) bootstrapTheme(THEME_COOKIE, THEME_CHANGE_EVENT);
  }, []);
  return null;
}
