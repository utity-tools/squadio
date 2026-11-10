import { LandingClose } from "./landing-close";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingPoints } from "./landing-points";
import { LandingProblem } from "./landing-problem";

/** The public landing at `/`, outside the app's frame; the app's Inicio is at `/home`. */
export function Landing() {
  return (
    <div data-landing className="flex min-h-dvh flex-1 flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <LandingPoints />
        <LandingProblem />
        <LandingClose />
      </main>
      <LandingFooter />
    </div>
  );
}
