import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { OwnOrganizations } from "./own-organizations";

const organizations = [
  { id: "0b5e0c1e-0000-4000-8000-000000000010", name: "Synthetic Consulting", example: false },
  { id: "0b5e0c1e-0000-4000-8000-000000000011", name: "Other Synthetic", example: false },
];
const [first, second] = organizations as [(typeof organizations)[0], (typeof organizations)[0]];

describe("OwnOrganizations", () => {
  it("lists the account's organizations and marks the one it works in", () => {
    renderWithIntl(
      <OwnOrganizations organizations={organizations} activeId={first.id} switchTo={vi.fn()} />,
    );

    const list = screen.getByRole("region", { name: "Tus organizaciones" });
    const [active, other] = within(list).getAllByRole("listitem");
    expect(active).toHaveTextContent("Synthetic Consulting");
    expect(active).toHaveTextContent("en la que trabajas");
    expect(within(active as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(other as HTMLElement).getByRole("button", { name: "Trabajar aquí: Other Synthetic" }),
    ).toBeVisible();
  });

  it("works in another one when asked", async () => {
    const user = userEvent.setup();
    const switchTo = vi.fn(async () => ({ ok: true }));
    renderWithIntl(
      <OwnOrganizations organizations={organizations} activeId={first.id} switchTo={switchTo} />,
    );

    await user.click(screen.getByRole("button", { name: "Trabajar aquí: Other Synthetic" }));

    expect(switchTo).toHaveBeenCalledWith(second.id);
  });

  it("keeps the focus on the list once it has switched, as the button goes away", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <OwnOrganizations
        organizations={organizations}
        activeId={first.id}
        switchTo={async () => ({ ok: true })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Trabajar aquí: Other Synthetic" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Tus organizaciones" })).toHaveFocus(),
    );
  });

  it("says when it could not switch", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <OwnOrganizations
        organizations={organizations}
        activeId={first.id}
        switchTo={async () => ({ ok: false })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Trabajar aquí: Other Synthetic" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cambiar de organización.",
    );
  });

  it("shows nothing for an account with one organization", () => {
    const { container } = renderWithIntl(
      <OwnOrganizations organizations={[first]} activeId={first.id} switchTo={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
