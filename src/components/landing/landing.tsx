import { LandingAudience } from "./landing-audience";
import { LandingBuiltFor } from "./landing-built-for";
import { LandingClose } from "./landing-close";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingHow } from "./landing-how";
import { LandingPoints } from "./landing-points";
import { LandingPrinciples } from "./landing-principles";
import { LandingProblem } from "./landing-problem";
import { LandingRoadmap } from "./landing-roadmap";

/** The public landing at `/`, outside the app's frame; the app's Inicio is at `/home`. */
export function Landing() {
  return (
    <div data-landing className="flex min-h-dvh flex-1 flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <LandingPoints />
        <LandingProblem />
        <LandingHow />
        <LandingBuiltFor />
        <LandingAudience />
        <LandingPrinciples />
        <LandingRoadmap />
        <LandingClose />
      </main>
      <LandingFooter />
    </div>
  );
}
