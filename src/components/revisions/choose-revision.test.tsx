import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Change } from "@/lib/revisions/change-check";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { ChooseRevision, type ChooseRevisionProps, type PreviewAnswer } from "./choose-revision";

// docs/domain.md, "Choosing a revision": «Elegir esta revisión» lists what changed since the
// revision was made, or says nothing did, names the scenario it replaces, and chooses it on
// confirmation. Nothing in the list blocks. Synthetic data only.

const REVISION = "6d656d6f-0000-4000-8000-000000000501";

const props = (overrides: Partial<ChooseRevisionProps> = {}): ChooseRevisionProps => ({
  revisionId: REVISION,
  number: 1,
  baseVersion: 3,
  chosen: false,
  focusTargetId: "chip",
  preview: async () => ({ ok: true, changes: [], replaces: null }),
  send: async () => ({ ok: true }),
  ...overrides,
});

const checked =
  (changes: Change[], replaces: { id: string; name: string } | null = null) =>
  async (): Promise<PreviewAnswer> => ({ ok: true, changes, replaces });

const open = async (user = userEvent.setup()) => {
  await user.click(screen.getByRole("button", { name: "Elegir esta revisión" }));
  return within(await screen.findByRole("dialog"));
};

describe("ChooseRevision", () => {
  it("says nothing changed, and chooses the revision on confirmation", async () => {
    const send = vi.fn<ChooseRevisionProps["send"]>(async () => ({ ok: true }));
    renderWithIntl(<ChooseRevision {...props({ send })} />);
    const user = userEvent.setup();

    const dialog = await open(user);
    expect(dialog.getByRole("heading", { name: "¿Elegir la revisión 1?" })).toBeTruthy();
    expect(await dialog.findByText("Nada ha cambiado desde que se hizo.")).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Elegir la revisión 1" }));

    expect(send).toHaveBeenCalledWith({ revisionId: REVISION, baseVersion: 3 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists each change as a sentence, and the scenario it replaces (Old revision chosen)", async () => {
    const preview = checked(
      [
        { kind: "team", added: 0, removed: 1, changed: 0 },
        { kind: "load", person: { id: "p", name: "Person p" }, now: true, weeks: 2 },
        { kind: "price", then: 20_000_000, now: 21_000_000 },
        { kind: "overhead", then: 1500, now: 1600 },
        { kind: "rulesVersion", then: 1, now: 2 },
      ],
      { id: "lean", name: "Plan B" },
    );
    renderWithIntl(<ChooseRevision {...props({ preview })} />);

    const dialog = await open();
    const list = within(
      await dialog.findByRole("region", { name: "Qué ha cambiado desde que se hizo" }),
    );
    const items = list
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/\s/g, " "));
    expect(items).toEqual([
      "Equipo: se ha guardado otro desde entonces (1 quitada). Se conserva, y vuelve al editor si se quita la elección.",
      "Carga de Person p: ahora pasa del 100 % en 2 semanas de la revisión; cuando se hizo, en ninguna.",
      "Precio o tope: entonces 200.000 €; ahora 210.000 €.",
      "Overhead: entonces 15 %; ahora 16 %.",
      "Reglas de cálculo: la revisión se hizo con la versión 1 y ahora rige la 2. Su resultado no se recalcula.",
    ]);
    expect(
      dialog.getByText("«Plan B» deja de ser el escenario elegido del proyecto."),
    ).toBeTruthy();
    // Nothing in the list blocks.
    expect(dialog.getByRole("button", { name: "Elegir la revisión 1" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectNoAxeViolations();
  });

  it("sends the page's ?access=none with both requests", async () => {
    const preview = vi.fn<ChooseRevisionProps["preview"]>(checked([]));
    const send = vi.fn<ChooseRevisionProps["send"]>(async () => ({ ok: true }));
    renderWithIntl(<ChooseRevision {...props({ preview, send, access: "none" })} />);
    const user = userEvent.setup();

    const dialog = await open(user);
    await dialog.findByText("Nada ha cambiado desde que se hizo.");
    await user.click(dialog.getByRole("button", { name: "Elegir la revisión 1" }));

    expect(preview).toHaveBeenCalledWith({ revisionId: REVISION, access: "none" });
    expect(send).toHaveBeenCalledWith({ revisionId: REVISION, access: "none", baseVersion: 3 });
  });

  it("says why it was refused and stays open", async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: "missing-rate" }));
    renderWithIntl(<ChooseRevision {...props({ send })} />, { locale: "en" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Choose this revision" }));
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByText("Nothing changed since it was made.");
    await user.click(dialog.getByRole("button", { name: "Choose revision 1" }));

    expect(dialog.getByRole("alert")).toHaveTextContent(
      "This revision has categories without a rate: its staff cost is undetermined, so it cannot be chosen.",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says the check failed and offers no choice", async () => {
    const preview = async (): Promise<PreviewAnswer> => ({ ok: false, reason: "failed" });
    renderWithIntl(<ChooseRevision {...props({ preview })} />);

    const dialog = await open();
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "No se ha podido comprobar qué ha cambiado.",
    );
    expect(dialog.queryByRole("button", { name: "Elegir la revisión 1" })).toBeNull();
    expect(dialog.getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });

  it("moves the focus to the chip and says so once the page shows it chosen", async () => {
    /** The page, which shows the revision chosen once the action answers. */
    function Page() {
      const [chosen, setChosen] = useState(false);
      const send = async () => {
        setChosen(true);
        return { ok: true as const };
      };
      return (
        <>
          <span id="chip" tabIndex={-1}>
            Revisión elegida
          </span>
          <ChooseRevision {...props({ chosen, send })} />
        </>
      );
    }
    renderWithIntl(<Page />);
    const user = userEvent.setup();
    const dialog = await open(user);
    await dialog.findByText("Nada ha cambiado desde que se hizo.");
    await user.click(dialog.getByRole("button", { name: "Elegir la revisión 1" }));

    expect(document.activeElement?.id).toBe("chip");
    expect(screen.getByRole("status")).toHaveTextContent("Revisión 1 elegida.");
    expect(screen.queryByRole("button", { name: "Elegir esta revisión" })).toBeNull();
  });
});
