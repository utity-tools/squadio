import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { DangerZone, type DeleteAction } from "./danger-zone";

const ok: DeleteAction = async () => ({ error: null });
const NAME = "Synthetic Consulting";

describe("DangerZone", () => {
  it("offers deleting the organization only to an account that has one", () => {
    const { unmount } = renderWithIntl(
      <DangerZone organizationName={NAME} deleteOrganization={ok} deleteAccount={ok} />,
    );
    expect(screen.getByRole("button", { name: "Borrar la organización…" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Borrar tu cuenta…" })).toBeVisible();

    unmount();
    renderWithIntl(
      <DangerZone organizationName={null} deleteOrganization={ok} deleteAccount={ok} />,
    );
    expect(screen.queryByRole("button", { name: "Borrar la organización…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Borrar tu cuenta…" })).toBeVisible();
  });

  it("deletes the organization only once its name is typed, starting on the name", async () => {
    const user = userEvent.setup();
    const deleteOrganization = vi.fn<DeleteAction>(ok);
    renderWithIntl(
      <DangerZone
        organizationName={NAME}
        deleteOrganization={deleteOrganization}
        deleteAccount={ok}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Borrar la organización…" }));
    const name = screen.getByRole("textbox", { name: `Escribe «${NAME}» para confirmar` });
    expect(name).toHaveFocus();

    const confirm = screen.getByRole("button", { name: "Borrar la organización" });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.click(confirm);
    expect(deleteOrganization).not.toHaveBeenCalled();

    await user.type(name, "Synthetic{Enter}");
    expect(deleteOrganization).not.toHaveBeenCalled();

    await user.clear(name);
    await user.type(name, NAME);
    expect(confirm).toHaveAttribute("aria-disabled", "false");
    await user.click(confirm);
    expect(deleteOrganization).toHaveBeenCalledOnce();
  });

  it("starts the account's window on Cancel, and says why a delete failed", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn<DeleteAction>(async () => ({ error: "failed" }));
    renderWithIntl(
      <DangerZone organizationName={null} deleteOrganization={ok} deleteAccount={deleteAccount} />,
    );

    await user.click(screen.getByRole("button", { name: "Borrar tu cuenta…" }));
    expect(screen.getByRole("alertdialog", { name: "¿Borrar tu cuenta?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Borrar mi cuenta" }));
    expect(deleteAccount).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido borrar. Vuelve a intentarlo.",
    );
  });

  it("closes with Cancel and forgets the typed name", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DangerZone organizationName={NAME} deleteOrganization={ok} deleteAccount={ok} />,
    );

    await user.click(screen.getByRole("button", { name: "Borrar la organización…" }));
    await user.type(screen.getByRole("textbox"), NAME);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Borrar la organización…" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("has no detectable accessibility violations, closed or with a window open", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DangerZone organizationName={NAME} deleteOrganization={ok} deleteAccount={ok} />,
    );
    await expectNoAxeViolations();

    await user.click(screen.getByRole("button", { name: "Borrar la organización…" }));
    await expectNoAxeViolations();
  });
});
