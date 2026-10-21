import { defineRouting } from "next-intl/routing";

// Spanish by default, without a prefix (`/scenarios/…`); English under `/en/…`. The URL alone
// picks the locale: no detection from Accept-Language and no locale cookie.
export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
});
