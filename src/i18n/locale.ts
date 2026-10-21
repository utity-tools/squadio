import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";

import { routing } from "./routing";

const segment = () => rootParams.locale();

/** The `[locale]` segment when it is a locale; the default otherwise, so a 404 can render. */
export async function currentLocale() {
  const value = await segment();
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/**
 * Pages call it first. `[locale]` sits at the root, so it also matches paths that are no locale
 * at all (`/robots.txt`, `/api/…`): those get the localized not-found page, inside the layout.
 */
export async function assertLocale() {
  if (!hasLocale(routing.locales, await segment())) notFound();
}
