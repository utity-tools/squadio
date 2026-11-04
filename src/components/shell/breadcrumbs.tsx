import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export type Crumb = {
  label: string;
  /** Where the crumb leads; only for pages that exist. The last crumb never links. */
  href?: string;
};

/** The top bar's trail: 13 px and muted, the last crumb the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslations("Shell");

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
              {last ? (
                <span aria-current="page" className="wrap-anywhere text-foreground">
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="wrap-anywhere underline-offset-2 hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="wrap-anywhere">{item.label}</span>
              )}
              {!last && <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
