import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Also the answer for a scenario outside the organization: it never says the scenario exists.
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/">{t("back")}</Link>
      </Button>
    </main>
  );
}
