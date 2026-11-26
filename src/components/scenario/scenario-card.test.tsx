import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { type ScenarioCardViewProps, ScenarioCardView } from "./scenario-card";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ADR 0017: the scenario's card, at the top of the right panel, as a pull request's header: what
// the scenario is — its name, one state, its project and terms, where it came from — then its
// result, history and details in tabs. Synthetic names.

const guide: ScenarioCardViewProps = {
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
  alternative: false,
  result: <p>El resultado</p>,
  history: <p>Las revisiones</p>,
};

describe("ScenarioCardView", () => {
  it("names the scenario, under its organization and project, and leaves the page heading to the bar", () => {
    renderWithIntl(<ScenarioCardView {...guide} organization={<span>Consultora Norte</span>} />);

    // The bar's name is the page's h1: it stays when the panel is hidden.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    // The status in the bar moves the focus here, a group named after the scenario.
    const card = screen.getByRole("group", { name: "Plan A" });
    expect(card).toHaveAttribute("id", "scenario-card");
    expect(card).toHaveAttribute("tabindex", "-1");
    expect(within(card).getByText("Plan A")).toHaveClass("text-2xl/tight");
    expect(screen.getByRole("link", { name: "Customer portal" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    // The top bar names the organization below lg: the card only from lg.
    expect(screen.getByText("Consultora Norte").parentElement).toHaveClass("max-lg:hidden");
  });

  it.each([
    [
      "chosen",
      { ...guide, scenario: { ...guide.scenario, chosen: true }, alternative: true },
      "Elegido",
    ],
    ["alternative", { ...guide, alternative: true }, "Alternativa"],
    ["draft", guide, "Borrador"],
  ] as const)("shows one state, %s", (tone, props, word) => {
    renderWithIntl(<ScenarioCardView {...props} />);

    expect(screen.getByText(word)).toHaveAttribute("data-tone", tone);
    expect(screen.getAllByText(/^(Elegido|Alternativa|Borrador)$/)).toHaveLength(1);
  });

  it("states its terms, and where an alternative came from", () => {
    renderWithIntl(<ScenarioCardView {...guide} origin={<p role="note">De la revisión 1</p>} />);

    expect(screen.getByText("Precio cerrado · 1 abr – 29 sept 2027")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("De la revisión 1");
  });

  it("opens on the result, and shows the history and the details on request", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ScenarioCardView {...guide} />);

    const tabs = screen.getByRole("tablist", { name: "Ficha del escenario" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Resultado", "Historial", "Detalles"]);
    expect(screen.getByText("El resultado")).toBeVisible();

    await user.click(within(tabs).getByRole("tab", { name: "Historial" }));
    expect(screen.getByText("Las revisiones")).toBeVisible();

    await user.click(within(tabs).getByRole("tab", { name: "Detalles" }));
    const details = screen.getByRole("tabpanel");
    expect(details).toHaveTextContent("ProyectoCustomer portal");
    expect(details).toHaveTextContent("Modelo de precioPrecio cerrado");
    expect(details).toHaveTextContent("130 días laborables");
  });

  it("leaves the span out of a scenario without a team", () => {
    renderWithIntl(<ScenarioCardView {...guide} span={null} />);

    expect(screen.getByText("Precio cerrado")).toBeInTheDocument();
  });

  it("speaks the page's locale", () => {
    renderWithIntl(
      <ScenarioCardView
        {...guide}
        project={{ ...guide.project, pricingModel: "time_and_materials" }}
        scenario={{ ...guide.scenario, chosen: true }}
      />,
      { locale: "en" },
    );

    expect(screen.getByText("Chosen")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByText(/^Time and materials · /)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<ScenarioCardView {...guide} alternative />);
    await expectNoAxeViolations();
  });
});
