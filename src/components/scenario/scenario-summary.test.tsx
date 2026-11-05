import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { guideSpan, guideTeam } from "@/test/guide-team";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { type ScenarioSummaryProps, ScenarioSummary } from "./scenario-summary";

const hours = { nominal: 2860, effective: 2181.59 };

const open = { team: guideTeam, span: guideSpan, project: { pricingModel: "fixed" as const } };

const noPrice = { undetermined: [{ code: "missingPrice" as const }] };

describe("ScenarioSummary", () => {
  it("shows the ledger with rate access", () => {
    const scenario: ScenarioSummaryProps["scenario"] = {
      ...open,
      rateAccess: true,
      result: {
        complete: false,
        hours,
        assignments: [],
        staffCostCents: 10_531_835,
        staffCostByCategory: [],
        extraCosts: [],
        directCostCents: 10_531_835,
        overheadCents: 1_579_775,
        bufferCents: 1_211_161,
        totalCostCents: 13_322_771,
        revenueCents: noPrice,
        directMarginCents: noPrice,
        directMarginBasisPoints: noPrice,
        netMarginCents: noPrice,
        netMarginBasisPoints: noPrice,
        effectiveRateCents: noPrice,
        marginStatus: null,
        warnings: [{ code: "missingPrice" }],
      },
      smallCategories: [],
      settings: {
        overheadBasisPoints: 1500,
        bufferBasisPoints: 1000,
        targetMarginBasisPoints: 2500,
      },
      extraCosts: [],
    };
    renderWithIntl(<ScenarioSummary scenario={scenario} />);

    expect(screen.getByRole("region", { name: "Margen neto" })).toBeInTheDocument();
    expect(screen.getByText("3 + 1 vacante")).toBeInTheDocument();
  });

  describe("without a team", () => {
    // No staff cost yet: the engine still returns revenue, which a fixed price already knows.
    const empty = (revenueCents: number | typeof noPrice) =>
      ({
        team: [],
        span: null,
        project: { pricingModel: "fixed" },
        rateAccess: true,
        result: {
          complete: typeof revenueCents === "number",
          hours: { nominal: 0, effective: 0 },
          assignments: [],
          staffCostCents: 0,
          staffCostByCategory: [],
          extraCosts: [],
          directCostCents: 0,
          overheadCents: 0,
          bufferCents: 0,
          totalCostCents: 0,
          revenueCents,
          directMarginCents: revenueCents,
          directMarginBasisPoints: typeof revenueCents === "number" ? 10_000 : noPrice,
          netMarginCents: revenueCents,
          netMarginBasisPoints: typeof revenueCents === "number" ? 10_000 : noPrice,
          effectiveRateCents: null,
          marginStatus: typeof revenueCents === "number" ? "green" : null,
          warnings: typeof revenueCents === "number" ? [] : [{ code: "missingPrice" }],
        },
        smallCategories: [],
        settings: {
          overheadBasisPoints: 1500,
          bufferBasisPoints: 1000,
          targetMarginBasisPoints: 2500,
        },
        extraCosts: [],
      }) as ScenarioSummaryProps["scenario"];

    it("says the margin waits for the team, and shows the price a fixed price knows", async () => {
      const { container } = renderWithIntl(
        <ScenarioSummary scenario={{ ...empty(20_000_000), project: { pricingModel: "fixed" } }} />,
      );

      expect(screen.getByRole("heading", { level: 2, name: "Resultado" })).toBeVisible();
      const margin = screen.getByRole("region", { name: "Margen neto" });
      expect(margin).toHaveTextContent("Aparece en cuanto haya alguien en el equipo.");
      expect(margin).not.toHaveTextContent("€");
      expect(screen.queryByText(/En objetivo/)).not.toBeInTheDocument();
      const revenue = screen.getByRole("rowheader", { name: /Ingresos/ }).parentElement!;
      expect(revenue.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(
        "Ingresos · precio cerrado200.000 €",
      );
      expect(
        screen.getByText("Los ingresos ya se conocen por el precio; el resto espera al equipo."),
      ).toBeVisible();
      // Nothing else: no statement of zeros, no figures, no bar.
      expect(screen.queryByRole("region", { name: "Cifras clave" })).not.toBeInTheDocument();
      expect(container.querySelector("[data-part=cost]")).toBeNull();
      await expectNoAxeViolations();
    });

    it("says what a fixed price misses when it has none", () => {
      renderWithIntl(
        <ScenarioSummary scenario={{ ...empty(noPrice), project: { pricingModel: "fixed" } }} />,
      );

      const revenue = screen.getByRole("rowheader", { name: /Ingresos/ }).parentElement!;
      expect(revenue).toHaveTextContent("Pendiente Falta el precio");
      expect(
        screen.getByText("Los ingresos esperan al precio; el resto, al equipo."),
      ).toBeVisible();
    });

    it("leaves time-and-materials revenue to the team's hours", () => {
      renderWithIntl(
        <ScenarioSummary
          scenario={{ ...empty(0), project: { pricingModel: "time_and_materials" } }}
        />,
      );

      expect(screen.queryByRole("rowheader", { name: /Ingresos/ })).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "En tiempo y materiales los ingresos salen de las horas del equipo: aparecen con él.",
        ),
      ).toBeVisible();
    });
  });

  it("shows team and hours without rate access, with no euro sign", () => {
    const { container } = renderWithIntl(
      <ScenarioSummary scenario={{ ...open, rateAccess: false, hours }} />,
    );

    expect(screen.getByRole("region", { name: "Equipo y horas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Margen neto" })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("€");
  });
});
