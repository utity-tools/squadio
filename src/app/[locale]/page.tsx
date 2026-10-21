import { Home } from "@/components/home/home";
import { assertLocale } from "@/i18n/locale";

export default async function HomePage() {
  await assertLocale();
  return <Home />;
}
