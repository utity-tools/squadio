import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ScenarioStateChip } from "./scenario-state-chip";

// ADR 0017: the words that name a scenario's state, and the chips that show them, come from one
// place. One state, always: chosen, else an alternative, else a draft.

describe("ScenarioStateChip", () => {
  it.each([
    [{ chosen: true, alternative: true }, "chosen", "Elegido"],
    [{ chosen: false, alternative: true }, "alternative", "Alternativa"],
    [{ chosen: false, alternative: false }, "draft", "Borrador"],
  ] as const)("shows %o as %s", (flags, tone, word) => {
    renderWithIntl(<ScenarioStateChip {...flags} />);

    const chip = screen.getByText(word);
    expect(chip).toHaveAttribute("data-tone", tone);
    // The icon is decoration: the word says the state.
    expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("speaks the page's locale", () => {
    renderWithIntl(<ScenarioStateChip chosen={false} alternative />, { locale: "en" });

    expect(screen.getByText("Alternative")).toHaveAttribute("data-tone", "alternative");
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<ScenarioStateChip chosen alternative={false} />);
    await expectNoAxeViolations();
  });
});
