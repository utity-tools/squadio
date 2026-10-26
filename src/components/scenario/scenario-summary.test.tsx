import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { guideSpan, guideTeam } from "@/test/guide-team";
import { renderWithIntl } from "@/test/render";

import { type ScenarioSummaryProps, ScenarioSummary } from "./scenario-summary";

const hours = { nominal: 2860, effective: 2181.59 };

const open = { team: guideTeam, span: guideSpan };

describe("ScenarioSummary", () => {
  it("shows the ledger with rate access", () => {
    const scenario: ScenarioSummaryProps["scenario"] = {
      ...open,
      rateAccess: true,
      result: { complete: false, hours, assignments: [], warnings: [{ code: "missingPrice" }] },
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
