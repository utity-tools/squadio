import { useFormatter, useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import type { RevisionLine } from "@/db/load-revisions";

/**
 * Who a revision without an author was made by: a visitor in the demo and its visitors' copies,
 * where nobody signs in, or else a member whose account is gone.
 */
export type AnonymousAuthor = "visitor" | "formerMember";

/** A dot between a line's parts, which a screen reader hears as a pause. */
function Separator() {
  return (
    <>
      <span aria-hidden> · </span>
      <span className="sr-only">, </span>
    </>
  );
}

export type RevisionMetaProps = ComponentProps<"span"> & {
  revision: Pick<RevisionLine, "madeAt" | "author" | "reason">;
  anonymous: AnonymousAuthor;
};

/** When a revision was made in Madrid, by whom and why (docs/domain.md, "What a revision holds"). */
export function RevisionMeta({ revision, anonymous, ...props }: RevisionMetaProps) {
  const t = useTranslations("Revisions");
  const format = useFormatter();

  return (
    <span {...props}>
      <time dateTime={revision.madeAt.toISOString()}>
        {format.dateTime(revision.madeAt, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Madrid",
        })}
      </time>
      <Separator />
      {/* Nobody made a migrated revision: its reason says so (docs/domain.md, "Choosing a revision"). */}
      {revision.reason !== "migrated" && (
        <>
          {revision.author ?? t(`anonymous.${anonymous}`)}
          <Separator />
        </>
      )}
      {t(`reason.${revision.reason}`)}
    </span>
  );
}
