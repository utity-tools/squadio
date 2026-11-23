import { useTranslations } from "next-intl";
import { useId } from "react";

import type { MemberRow } from "@/db/members";

/**
 * The organization's members with their roles (ADR 0015). Emails show only where the page was
 * given them, which it is for the owner alone.
 */
export function MembersList({ members }: { members: MemberRow[] }) {
  const t = useTranslations("Members");
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full max-w-xl flex-col gap-3 text-left">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("membersHeading")}
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
            <span className="font-medium">
              {member.name}
              {member.you && <span className="text-muted-foreground"> ({t("you")})</span>}
            </span>
            {member.email && (
              <span className="text-sm break-all text-muted-foreground">{member.email}</span>
            )}
            <span className="ml-auto text-sm">{t(`roles.${member.role}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
