import { routing } from "@/i18n/routing";

// ADR 0015, amendment of 2026-11-23 (slice 4b): a person who opens an invitation's link signed out
// finds the page not found, with a way to sign in that comes back to it. The sign-in page takes
// the path to come back to from its query, so it keeps only an invitation's page on this origin,
// never anything else, which would make it an open redirect.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const prefixes = routing.locales.filter((locale) => locale !== routing.defaultLocale).join("|");
const INVITATION_PATH = new RegExp(`^(?:/(?:${prefixes}))?/invitations/${UUID}$`, "i");

/** The invitation's page to come back to after signing in, or null for anything else. */
export function invitationReturnPath(path: string | string[] | undefined): string | null {
  return typeof path === "string" && INVITATION_PATH.test(path) ? path : null;
}
