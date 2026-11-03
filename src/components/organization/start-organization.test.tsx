import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { type StartAction, StartOrganization } from "./start-organization";

const ok: StartAction = async () => ({ error: null });

describe("StartOrganization", () => {
  it("offers an empty organization, and adopting only when the cookie leads to a copy", () => {
    const { unmount } = renderWithIntl(
      <StartOrganization canAdopt={false} createEmpty={ok} adopt={ok} />,
    );
    expect(screen.getByRole("button", { name: "Crear una organización vacía" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /con este ejemplo y mis cambios/ }),
    ).not.toBeInTheDocument();

    unmount();
    renderWithIntl(<StartOrganization canAdopt createEmpty={ok} adopt={ok} />);
    expect(
      screen.getByRole("button", {
        name: "Crear una organización nueva con este ejemplo y mis cambios",
      }),
    ).toBeVisible();
  });

  it("names the adopted organization the example by default, and the empty one not at all", () => {
    renderWithIntl(<StartOrganization canAdopt createEmpty={ok} adopt={ok} />);
    const [adoptName, emptyName] = screen.getAllByRole("textbox", {
      name: "Nombre de la organización",
    });
    expect(adoptName).toHaveValue("Ejemplo de Squadio");
    expect(emptyName).toHaveValue("");
  });

  it("sends the typed name, and says why it failed, tied to the field", async () => {
    const user = userEvent.setup();
    const createEmpty = vi.fn<StartAction>(async () => ({ error: "blank" }));
    renderWithIntl(<StartOrganization canAdopt={false} createEmpty={createEmpty} adopt={ok} />);

    const name = screen.getByRole("textbox", { name: "Nombre de la organización" });
    await user.type(name, "Synthetic Consulting");
    await user.click(screen.getByRole("button", { name: "Crear una organización vacía" }));

    const sent = createEmpty.mock.calls[0]?.[1];
    expect(sent?.get("name")).toBe("Synthetic Consulting");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Escribe un nombre para la organización.");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Escribe un nombre para la organización.");
  });

  it("says when the copy is gone, without marking the name wrong", async () => {
    const user = userEvent.setup();
    const adopt: StartAction = async () => ({ error: "no-copy" });
    renderWithIntl(<StartOrganization canAdopt createEmpty={ok} adopt={adopt} />, {
      locale: "en",
    });

    await user.click(
      screen.getByRole("button", {
        name: "Create a new organization with this example and my changes",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/no copy of the demo to keep/);
    const [adoptName] = screen.getAllByRole("textbox", { name: "Organization name" });
    expect(adoptName).not.toHaveAttribute("aria-invalid");
  });
});
