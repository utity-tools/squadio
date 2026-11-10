import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";

/** The public landing at `/`, outside the app's frame; the app's Inicio is at `/home`. */
export function Landing() {
  return (
    <div data-landing className="flex min-h-dvh flex-1 flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
      </main>
    </div>
  );
}
