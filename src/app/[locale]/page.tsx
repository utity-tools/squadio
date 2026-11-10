import { Landing } from "@/components/landing/landing";
import { assertLocale } from "@/i18n/locale";

export default async function LandingPage() {
  await assertLocale();
  return <Landing />;
}
