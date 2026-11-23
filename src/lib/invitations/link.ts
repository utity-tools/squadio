import { routing } from "@/i18n/routing";

/**
 * The link the owner copies for an invitation (ADR 0015): its page, `/invitations/<id>`, on this
 * deployment's origin, in the owner's locale. The default locale has no prefix (routing.ts).
 */
export function invitationLink(appUrl: string, locale: string, invitationId: string): string {
  const origin = appUrl.replace(/\/+$/, "");
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${origin}${prefix}/invitations/${invitationId}`;
}
