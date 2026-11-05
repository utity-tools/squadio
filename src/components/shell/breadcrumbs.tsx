import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  /** Where the crumb leads; only for pages that exist. The last crumb never links. */
  href?: string;
};

/**
 * The top bar's trail: 13 px and muted, the last crumb the current page. On phones only the
 * parent crumb stays, on one line, as a link back: the page's heading names the current one, and
 * the bar keeps to 56 px beside the organization.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslations("Shell");
  const parent = items.length - 2;

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          // On phones the parent stays; with a page to go to, it reads as a link back.
          const kept = index === parent;
          const back = kept && item.href !== undefined;
          return (
            <li
              key={`${index}-${item.label}`}
              className={cn(
                "flex min-w-0 items-center gap-1",
                items.length > 1 && !kept && "max-sm:hidden",
              )}
            >
              {back && <ChevronLeftIcon aria-hidden className="size-3.5 shrink-0 sm:hidden" />}
              {last ? (
                <span aria-current="page" className="wrap-anywhere text-foreground">
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="wrap-anywhere underline-offset-2 hover:text-foreground hover:underline max-sm:truncate"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="wrap-anywhere">{item.label}</span>
              )}
              {!last && (
                <ChevronRightIcon
                  aria-hidden
                  className={cn("size-3.5 shrink-0", kept && "max-sm:hidden")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
