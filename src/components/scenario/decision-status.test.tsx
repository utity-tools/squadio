import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { DecisionStatusButton } from "./decision-status";
import { RailToggle } from "./rail-toggle";
import { SCENARIO_PANEL_ID } from "./scenario-shell";

// ADR 0017: the bar says whether the scenario is ready to choose, as GitHub's merge status, and
// opens the card on its result; the card's panel can be hidden.

afterEach(() => {
  delete document.documentElement.dataset.rail;
});

describe("DecisionStatusButton", () => {
  it.each([
    [{ kind: "ready", tone: "ok" } as const, "Listo para elegir", "text-status-ok"],
    [{ kind: "below", tone: "warn" } as const, "Bajo objetivo", "text-status-warn"],
    [{ kind: "loss", tone: "bad" } as const, "En pérdidas", "text-status-bad"],
    [{ kind: "noTeam", tone: "bad" } as const, "Sin equipo", "text-status-bad"],
    [
      { kind: "missing", tone: "warn", determined: 6, total: 9 } as const,
      "Faltan datos · 6 de 9",
      "text-status-warn",
    ],
  ])("says %o in words, with an icon of its tone", (status, text, tone) => {
    renderWithIntl(<DecisionStatusButton status={status} />);

    const button = screen.getByRole("button", { name: `Estado para elegir: ${text}` });
    expect(button).toHaveTextContent(text);
    expect(button.querySelector("svg")).toHaveClass(tone);
  });

  it("shows the card and moves the focus to it", async () => {
    document.documentElement.dataset.rail = "hidden";
    renderWithIntl(
      <>
        <DecisionStatusButton status={{ kind: "ready", tone: "ok" }} />
        <div id="scenario-card" tabIndex={-1} />
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Estado para elegir/ }));
    expect(document.documentElement.dataset.rail).toBe("shown");
    expect(document.getElementById("scenario-card")).toHaveFocus();
  });
});

describe("RailToggle", () => {
  it("hides and shows the card's panel, saying which it will do and whether it is open", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RailToggle />);

    const toggle = screen.getByRole("button", { name: "Ocultar el panel" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", SCENARIO_PANEL_ID);
    expect(toggle).not.toHaveAttribute("aria-pressed");
    await user.click(toggle);
    expect(document.documentElement.dataset.rail).toBe("hidden");
    expect(screen.getByRole("button", { name: "Mostrar el panel" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("forgets the choice when the editor goes, so other pages keep their panel", () => {
    document.documentElement.dataset.rail = "hidden";
    const { unmount } = renderWithIntl(<RailToggle />);
    unmount();
    expect(document.documentElement.dataset.rail).toBeUndefined();
  });
});
