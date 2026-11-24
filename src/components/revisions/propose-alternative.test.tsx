import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ProposeAlternative, type SendProposal } from "./propose-alternative";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

// docs/domain.md, "Derived alternative": «Proponer alternativa» on a revision makes a new draft of
// its project and opens it in the editor; a refusal is said next to the button.

const REVISION = "6d656d6f-0000-4000-8000-000000000501";
const ALTERNATIVE = "00000000-0000-4000-8000-0000000000a1";
const proposed: SendProposal = async () => ({ ok: true, scenarioId: ALTERNATIVE });

describe("ProposeAlternative", () => {
  it("sends the revision and the page's locale, then opens the alternative", async () => {
    push.mockReset();
    const send = vi.fn(proposed);
    renderWithIntl(<ProposeAlternative revisionId={REVISION} send={send} />);

    const button = screen.getByRole("button", { name: "Proponer alternativa" });
    expect(button).toHaveAccessibleDescription(
      "Crea un borrador nuevo del proyecto con el equipo y los costes de esta revisión, que no cambia.",
    );
    await userEvent.setup().click(button);
    expect(send).toHaveBeenCalledWith({ revisionId: REVISION, locale: "es" });
    expect(push).toHaveBeenCalledWith(`/scenarios/${ALTERNATIVE}`);
  });

  it("says why it was refused and stays ready to try again", async () => {
    push.mockReset();
    const send = vi.fn<SendProposal>(async () => ({ ok: false, reason: "too-many" }));
    renderWithIntl(<ProposeAlternative revisionId={REVISION} send={send} />, { locale: "en" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Propose an alternative" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This project already has 20 scenarios, the most it can hold.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Propose an alternative" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("answers an unknown refusal or a thrown action as a failure", async () => {
    const send = vi
      .fn<SendProposal>()
      .mockResolvedValueOnce({ ok: false, reason: "invalid" })
      .mockRejectedValueOnce(new Error("network"));
    renderWithIntl(<ProposeAlternative revisionId={REVISION} send={send} />);
    const user = userEvent.setup();
    for (let attempt = 0; attempt < 2; attempt++) {
      await user.click(screen.getByRole("button", { name: "Proponer alternativa" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No se ha podido proponer la alternativa. Inténtalo de nuevo.",
      );
    }
  });

  it("sends once while it is busy", async () => {
    let finish: (answer: { ok: true; scenarioId: string }) => void = () => {};
    const send = vi.fn<SendProposal>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderWithIntl(<ProposeAlternative revisionId={REVISION} send={send} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Proponer alternativa" }));
    const busy = screen.getByRole("button", { name: "Proponiendo…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true, scenarioId: ALTERNATIVE });
  });

  it("has no axe violations", async () => {
    renderWithIntl(<ProposeAlternative revisionId={REVISION} send={proposed} />);
    await expectNoAxeViolations();
  });
});
