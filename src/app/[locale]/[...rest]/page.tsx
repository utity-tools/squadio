import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

// The not-found page cannot set its own title; the page that triggers it can.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("NotFound");
  return { title: t("title") };
}

// Unknown paths under a locale render the localized not-found page inside the layout.
export default function CatchAll() {
  notFound();
}
