"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { OwnOrganization } from "@/db/switch-organization";

type OwnOrganizationsProps = {
  organizations: OwnOrganization[];
  activeId: string;
  /** Makes another of them the active one; the server checks the membership and reloads. */
  switchTo: (organizationId: string) => Promise<{ ok: boolean }>;
};

/**
 * The account's organizations on the organization page (ADR 0015): an account invited into
 * another has several, and picks the one it works in here as well as in the top bar's switcher.
 * Nothing for an account with one.
 */
export function OwnOrganizations({ organizations, activeId, switchTo }: OwnOrganizationsProps) {
  const t = useTranslations("Organization");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  if (organizations.length < 2) return null;

  function choose(id: string) {
    if (pending) return;
    setFailed(false);
    startTransition(async () => {
      const result = await switchTo(id);
      if (!result.ok) setFailed(true);
      // The button that had the focus goes away with the switch: the list's heading takes it.
      else heading.current?.focus();
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex w-full max-w-2xl flex-col gap-3 text-left">
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {t("organizationsHeading")}
      </h2>
      {failed && (
        <p role="alert" className="text-[13px] text-status-bad-text">
          {t("switchFailed")}
        </p>
      )}
      <ul className="flex flex-col divide-y rounded-lg border">
        {organizations.map((organization) => (
          <li key={organization.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-medium">{organization.name}</span>
            {organization.id === activeId ? (
              <span className="text-sm text-muted-foreground">{t("activeOrganization")}</span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto aria-disabled:opacity-50"
                aria-label={t("workInLabel", { name: organization.name })}
                aria-disabled={pending}
                onClick={() => choose(organization.id)}
              >
                {t("workIn")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
