import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { type ScenarioHeaderProps, ScenarioCrumbs } from "./scenario-header";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const guide: ScenarioHeaderProps = {
  project: {
    id: "p1",
    name: "Customer portal",
    client: "Demo Client",
    pricingModel: "fixed",
    plannedPeriod: null,
    description: null,
  },
  scenario: { name: "Plan A", chosen: false, otherChosen: null },
  span: { start: "2027-04-01", end: "2027-09-29", workingDays: 130 },
};

describe("ScenarioCrumbs", () => {
  it("leads from Proyectos and the project to the scenario, in the trail below lg", () => {
    renderWithIntl(<ScenarioCrumbs project={guide.project} scenario={guide.scenario} />);

    const breadcrumb = screen.getByRole("navigation", { name: "Ruta de navegación" });
    const items = within(breadcrumb).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Proyectos",
      "Customer portal",
      "Plan A",
    ]);
    expect(within(breadcrumb).getByRole("link", { name: "Proyectos" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(breadcrumb).getByRole("link", { name: "Customer portal" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(within(items.at(-1)!).getByText("Plan A")).toHaveAttribute("aria-current", "page");
  });
});
