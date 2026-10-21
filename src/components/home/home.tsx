import { useTranslations } from "next-intl";

export function Home() {
  const t = useTranslations("Home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Squadio</h1>
      <p className="max-w-md text-lg text-balance text-muted-foreground">{t("tagline")}</p>
    </main>
  );
}
