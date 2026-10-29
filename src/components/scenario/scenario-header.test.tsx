import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { type ScenarioHeaderProps, ScenarioHeader } from "./scenario-header";

const guide: ScenarioHeaderProps = {
  project: { name: "Customer portal", client: "Demo Client", pricingModel: "fixed" },
  scenario: { name: "Plan A", chosen: false, otherChosen: null },
  span: { start: "2027-04-01", end: "2027-09-29", workingDays: 130 },
};

describe("ScenarioHeader", () => {
  it("names the scenario in the page heading", () => {
    renderWithIntl(<ScenarioHeader {...guide} />);

    expect(screen.getByRole("heading", { level: 1, name: "Plan A" })).toBeInTheDocument();
  });

  it("leads from the project and its client to the scenario", () => {
    renderWithIntl(<ScenarioHeader {...guide} />);

    const breadcrumb = screen.getByRole("navigation", { name: "Ruta de navegación" });
    const items = within(breadcrumb).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Customer portal (Demo Client)",
      "Plan A",
    ]);
    expect(items.at(-1)).toHaveAttribute("aria-current", "page");
  });

  it("shows the pricing model and the project span with its working days", () => {
    renderWithIntl(<ScenarioHeader {...guide} />);

    expect(screen.getByText("Precio cerrado")).toBeInTheDocument();
    // Intl may put thin spaces around the range dash.
    expect(screen.getByText(/^1 abr\s–\s29 sept 2027$/)).toBeInTheDocument();
    expect(screen.getByText("130 días laborables")).toBeInTheDocument();
  });

  it("marks the chosen scenario", () => {
    renderWithIntl(
      <ScenarioHeader {...guide} scenario={{ name: "Plan A", chosen: true, otherChosen: null }} />,
    );

    expect(screen.getByText("Elegido")).toBeInTheDocument();
  });

  it("has no badge on a scenario that is not chosen", () => {
    renderWithIntl(<ScenarioHeader {...guide} />);

    expect(screen.queryByText("Elegido")).not.toBeInTheDocument();
  });

  it("leaves the span out of a scenario without a team", () => {
    renderWithIntl(<ScenarioHeader {...guide} span={null} />);

    expect(screen.queryByText(/días laborables/)).not.toBeInTheDocument();
    expect(screen.getByText("Precio cerrado")).toBeInTheDocument();
  });

  it("speaks the page's locale", () => {
    renderWithIntl(
      <ScenarioHeader
        {...guide}
        project={{ ...guide.project, pricingModel: "time_and_materials" }}
        scenario={{ name: "Plan A", chosen: true, otherChosen: null }}
        span={{ start: "2027-04-01", end: "2027-04-01", workingDays: 1 }}
      />,
      { locale: "en" },
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Time and materials")).toBeInTheDocument();
    expect(screen.getByText("Chosen")).toBeInTheDocument();
    expect(screen.getByText("Apr 1, 2027")).toBeInTheDocument();
    expect(screen.getByText("1 working day")).toBeInTheDocument();
  });
});
