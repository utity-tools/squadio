"use client";

import { Building, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useRouter } from "@/i18n/navigation";
import { initials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";

import { useShellPlacement } from "./placement";

type Organization = { id: string; name: string; example: boolean };

type OrganizationSwitcherProps = {
  /** The account's organizations, in the order it joined them. */
  organizations: Organization[];
  /** The one the session works in. */
  activeId: string;
  /** Makes another of them the active one; the server checks the membership. */
  switchTo: (organizationId: string) => Promise<{ ok: boolean }>;
};

/**
 * The active organization, on the left of the top bar (design board 14): it opens «Tus
 * organizaciones», the active one checked, and «Ajustes de la organización». With one
 * organization the menu offers only the settings. An example organization (adopted from a
 * visitor's copy) carries the «Demo» chip.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
  switchTo,
}: OrganizationSwitcherProps) {
  const t = useTranslations("Shell");
  const placement = useShellPlacement();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const groupLabel = useId();
  const router = useRouter();
  const active = organizations.find((organization) => organization.id === activeId);
  if (!active) return null;

  function choose(id: string) {
    if (id === activeId || pending) return;
    setFailed(false);
    startTransition(async () => {
      const result = await switchTo(id);
      // The page the person was on may belong to the other organization: its own page does not.
      if (result.ok) router.push("/organization");
      else setFailed(true);
    });
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", placement === "menu" && "w-full")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-busy={pending}
            className={cn(
              "min-w-0 justify-start gap-2 max-lg:h-11",
              placement === "menu" && "min-h-11 w-full text-[15px]",
            )}
          >
            {/* Its name is what it shows, after a hidden prefix (WCAG 2.5.3, label in name). */}
            <span className="sr-only">{t("organizationPrefix")}</span>{" "}
            <span className="truncate">{active.name}</span>
            {active.example && (
              <>
                {" "}
                <Chip tone="demo">{t("demo")}</Chip>
              </>
            )}
            <ChevronDown aria-hidden className="ms-auto size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
          {organizations.length > 1 && (
            <>
              <DropdownMenuLabel id={groupLabel}>{t("yourOrganizations")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-labelledby={groupLabel}
                value={activeId}
                onValueChange={choose}
              >
                {organizations.map((organization) => (
                  <DropdownMenuRadioItem
                    key={organization.id}
                    value={organization.id}
                    className="min-h-9 gap-2.5 pl-2 max-lg:min-h-11 [&>span:first-child]:start-auto [&>span:first-child]:end-2"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                        organization.id === activeId
                          ? "tint-brand text-brand-text"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {initials(organization.name)}
                    </span>
                    <span className="truncate pe-6">{organization.name}</span>
                    {organization.example && <Chip tone="demo">{t("demo")}</Chip>}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild className="max-lg:min-h-11">
            <Link href="/organization">
              <Building aria-hidden />
              {t("organizationSettings")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("switchFailed")}
        </p>
      )}
    </div>
  );
}

/**
 * The demo a visitor works in (design board "Inicio"): named, with its «Demo» chip, and a note
 * that its names and figures are fictitious. There is nothing to switch to.
 */
export function DemoOrganization({ copy }: { copy: boolean }) {
  const t = useTranslations("Shell");
  const placement = useShellPlacement();

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm",
        placement === "menu" && "min-h-11 px-2.5",
      )}
    >
      <span className="truncate font-medium">{t("demoOrganization")}</span>
      {/* «Consultora Demo» already says it: the chip is for the eye. */}
      <Chip tone="demo" aria-hidden>
        {t("demo")}
      </Chip>
      <span
        className={cn("text-[13px] text-muted-foreground", placement === "bar" && "max-xl:sr-only")}
      >
        {copy ? t("fictitiousCopy") : t("fictitious")}
      </span>
    </div>
  );
}
