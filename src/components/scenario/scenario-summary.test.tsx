import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { guideSpan, guideTeam } from "@/test/guide-team";
import { renderWithIntl } from "@/test/render";

import { type ScenarioSummaryProps, ScenarioSummary } from "./scenario-summary";

const hours = { nominal: 2860, effective: 2181.59 };

const open = { team: guideTeam, span: guideSpan };

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
    expect(screen.getByText("3 personas")).toBeInTheDocument();
    expect(screen.getByText("1 vacante")).toBeInTheDocument();
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
