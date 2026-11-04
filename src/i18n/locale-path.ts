import { routing } from "./routing";

/**
 * The browser's path and query without the locale's prefix, for next-intl's router to put the
 * chosen locale's on. Read from `window.location` when the person acts, never while rendering:
 * reading the URL in a client component keeps pages from prerendering (Cache Components).
 */
export function pathInLocale(pathname: string, search: string): string {
  const [, first, ...rest] = pathname.split("/");
  const prefixed = routing.locales.some(
    (locale) => locale !== routing.defaultLocale && locale === first,
  );
  const path = prefixed ? `/${rest.join("/")}` : pathname;
  return `${path === "/" || path === "" ? "/" : path.replace(/\/$/, "")}${search}`;
}
