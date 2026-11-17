import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { hoursBasis, ratesBasis } from "@/lib/scenarios/basis.fixtures";
import { seatId, team } from "@/lib/scenarios/change.fixtures";
import type { ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

import { DuplicateButton, type SendDuplicate, ScenarioDuplicate } from "./duplicate-scenario";
import { ScenarioEditor, ScenarioStoreProvider } from "./scenario-editor";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

// docs/domain.md, "Duplicating a scenario": «Duplicar» makes a draft copy and opens it; with rate
// access only, and on the scenario's page once its changes are saved.

const COPY = "00000000-0000-4000-8000-0000000000c0";
const copied: SendDuplicate = async () => ({ ok: true, scenarioId: COPY });

describe("DuplicateButton", () => {
  it("sends the scenario and the page's locale, then opens the copy", async () => {
    push.mockReset();
    const send = vi.fn(copied);
    renderWithIntl(<DuplicateButton scenarioId="s1" name="Plan A" send={send} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Duplicar Plan A" }));
    expect(send).toHaveBeenCalledWith({ scenarioId: "s1", locale: "es" });
    expect(push).toHaveBeenCalledWith(`/scenarios/${COPY}`);
  });

  it("is ready again once the copy's page has opened, for when one comes back to this page", async () => {
    // The router keeps a page it leaves, with its state, and shows it again on the way back.
    push.mockReset();
    renderWithIntl(<DuplicateButton scenarioId="s1" name="Plan A" send={copied} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Duplicar Plan A" }));
    expect(push).toHaveBeenCalledWith(`/scenarios/${COPY}`);
    const button = screen.getByRole("button", { name: "Duplicar Plan A" });
    expect(button).toHaveTextContent("Duplicar");
    expect(button).not.toHaveAttribute("aria-disabled");
  });

  it("says why it was refused and stays where it was, ready to try again", async () => {
    push.mockReset();
    const send = vi.fn<SendDuplicate>(async () => ({ ok: false, reason: "too-many" }));
    renderWithIntl(<DuplicateButton scenarioId="s1" send={send} />, { locale: "en" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This project already has 20 scenarios, the most it can hold.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Duplicate" })).not.toHaveAttribute("aria-disabled");
  });

  it("answers an unknown refusal or a thrown action as a failure", async () => {
    const send = vi
      .fn<SendDuplicate>()
      .mockResolvedValueOnce({ ok: false, reason: "invalid" })
      .mockRejectedValueOnce(new Error("network"));
    renderWithIntl(<DuplicateButton scenarioId="s1" send={send} />);
    const user = userEvent.setup();
    for (let attempt = 0; attempt < 2; attempt++) {
      await user.click(screen.getByRole("button", { name: "Duplicar" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No se ha podido duplicar el escenario. Inténtalo de nuevo.",
      );
    }
  });

  it("has no axe violations", async () => {
    renderWithIntl(<DuplicateButton scenarioId="s1" send={copied} />);
    await expectNoAxeViolations();
  });
});

function renderInEditor(basis: ScenarioBasis, send: SendDuplicate = vi.fn(copied)) {
  const stores: ScenarioStore[] = [];
  const save = vi.fn(() => new Promise<SaveOutcome>(() => {}));
  renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor scenarioId={seatId(99)} editing={{ basis, team, version: 3 }} save={save}>
        <ScenarioDuplicate send={send} />
        <StoreSpy onStore={(store) => void stores.push(store)} />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
  );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { store, send };
}

describe("ScenarioDuplicate", () => {
  it("duplicates the page's scenario", async () => {
    const { send } = renderInEditor(ratesBasis);
    await userEvent.setup().click(screen.getByRole("button", { name: "Duplicar" }));
    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), locale: "es" });
  });

  it("is not offered without rate access: extra costs are restricted money", () => {
    renderInEditor(hoursBasis);
    expect(screen.queryByRole("button", { name: "Duplicar" })).not.toBeInTheDocument();
  });

  it("waits for the page's changes to be saved, and says so", async () => {
    const { store, send } = renderInEditor(ratesBasis);
    const [first] = team;
    if (!first) throw new Error("expected a team");
    act(() => {
      store.getState().dispatch({ type: "remove", id: first.id });
    });
    const button = screen.getByRole("button", { name: "Duplicar" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Se podrá duplicar cuando se guarden los cambios.");
    await userEvent.setup().click(button);
    expect(send).not.toHaveBeenCalled();
  });
});
