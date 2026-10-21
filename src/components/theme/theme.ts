// The theme preference lives in a cookie and becomes `data-theme` on <html> before the first
// paint, through an inline script in <head> (Next.js guide "Preventing flash before hydration").

export const THEME_COOKIE = "squadio-theme";
export const THEME_CHANGE_EVENT = "squadio:themechange";

export const themePreferences = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof themePreferences)[number];

export const isThemePreference = (value: string | undefined): value is ThemePreference =>
  themePreferences.some((preference) => preference === value);

/** The stored preference in a `document.cookie` string; system when absent or unknown. */
export function readThemePreference(cookie: string): ThemePreference {
  const value = cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);
  return isThemePreference(value) ? value : "system";
}

/** The cookie that stores a preference for a year; Secure whenever the page is on https. */
export function themeCookie(preference: ThemePreference, protocol: string) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${THEME_COOKIE}=${preference}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

/** Stores the preference and lets the page apply it. */
export function writeThemePreference(preference: ThemePreference) {
  document.cookie = themeCookie(preference, window.location.protocol);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * Sets `data-theme` from the cookie, or from the system when the preference is system, and keeps
 * it current. It runs inline in <head> as a string, so it must not use anything outside itself.
 */
export function bootstrapTheme(cookieName: string, changeEvent: string) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    let preference: string | undefined;
    try {
      preference = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
    } catch {
      // Cookies can be blocked; follow the system then.
    }
    const dark = preference === "dark" || (preference !== "light" && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  apply();
  media.addEventListener("change", apply);
  window.addEventListener(changeEvent, apply);
}

export const themeScript = `(${bootstrapTheme.toString()})(${JSON.stringify(THEME_COOKIE)},${JSON.stringify(THEME_CHANGE_EVENT)})`;
