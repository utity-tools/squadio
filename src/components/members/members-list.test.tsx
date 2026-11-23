import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MemberRow } from "@/db/members";
import { renderWithIntl } from "@/test/render";

import { type ChangeRoleAction, MembersList, type RemoveMemberAction } from "./members-list";

const members: MemberRow[] = [
  { id: "m1", name: "Ada Synthetic", role: "owner", email: "ada@squadio.example", you: true },
  { id: "m2", name: "Grace Synthetic", role: "member", email: "grace@squadio.example", you: false },
  { id: "m3", name: "Hedy Synthetic", role: "viewer", email: null, you: false },
];

describe("MembersList", () => {
  it("lists each member with their role, and marks the reader", () => {
    renderWithIntl(<MembersList members={members} />);

    const list = screen.getByRole("region", { name: "Quién está en la organización" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Ada Synthetic");
    expect(items[0]).toHaveTextContent("(tú)");
    expect(items[0]).toHaveTextContent("Propietario");
    expect(items[1]).toHaveTextContent("Miembro");
    expect(items[1]).not.toHaveTextContent("(tú)");
    expect(items[2]).toHaveTextContent("Lector");
  });

  it("shows an email only where the page was given one", () => {
    renderWithIntl(<MembersList members={members} />);

    expect(screen.getByText("ada@squadio.example")).toBeInTheDocument();
    expect(screen.getByText("grace@squadio.example")).toBeInTheDocument();
    const hedy = screen.getAllByRole("listitem")[2];
    expect(hedy).not.toHaveTextContent("@");
  });

  it("speaks English too", () => {
    renderWithIntl(<MembersList members={members} />, { locale: "en" });

    expect(screen.getByRole("region", { name: "Who is in the organization" })).toBeVisible();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });
});

describe("MembersList, for the owner", () => {
  const changed: ChangeRoleAction = async () => ({ error: null });
  const removed: RemoveMemberAction = async () => ({ error: null });

  function renderForOwner(
    props: { changeRole?: ChangeRoleAction; remove?: RemoveMemberAction } = {},
  ) {
    return renderWithIntl(
      <MembersList
        members={members}
        manage={{ changeRole: props.changeRole ?? changed, remove: props.remove ?? removed }}
      />,
    );
  }

  it("offers nothing to change without the owner's actions", () => {
    renderWithIntl(<MembersList members={members} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers the other role and removal on every row but the owner's", () => {
    renderForOwner();

    const [ada, grace, hedy] = screen.getAllByRole("listitem");
    expect(within(ada!).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(grace!).getByRole("button", { name: "Hacer lector a Grace Synthetic" }),
    ).toBeVisible();
    expect(
      within(hedy!).getByRole("button", { name: "Hacer miembro a Hedy Synthetic" }),
    ).toBeVisible();
    expect(
      within(grace!).getByRole("button", { name: "Quitar a Grace Synthetic de la organización" }),
    ).toBeVisible();
  });

  it("changes the role, says so, and keeps the focus on the button", async () => {
    const changeRole = vi.fn<ChangeRoleAction>(async () => ({ error: null }));
    const user = userEvent.setup();
    renderForOwner({ changeRole });

    const button = screen.getByRole("button", { name: "Hacer lector a Grace Synthetic" });
    await user.click(button);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Grace Synthetic ahora tiene el rol Lector.",
      ),
    );
    const form = changeRole.mock.calls[0]?.[1];
    expect(form?.get("memberId")).toBe("m2");
    expect(form?.get("role")).toBe("viewer");
    expect(button).toHaveFocus();
  });

  it("says why a change was refused, in its row", async () => {
    const user = userEvent.setup();
    renderForOwner({ changeRole: async () => ({ error: "not-found" }) });

    await user.click(screen.getByRole("button", { name: "Hacer miembro a Hedy Synthetic" }));

    const hedy = screen.getAllByRole("listitem")[2]!;
    expect(await within(hedy).findByRole("alert")).toHaveTextContent(
      "Esa persona ya no está en la organización, o su rol no se puede cambiar.",
    );
  });

  it("removes only after the confirmation window, which starts on Cancel", async () => {
    const remove = vi.fn<RemoveMemberAction>(async () => ({ error: null }));
    const user = userEvent.setup();
    renderForOwner({ remove });

    await user.click(
      screen.getByRole("button", { name: "Quitar a Grace Synthetic de la organización" }),
    );
    const dialog = screen.getByRole("alertdialog", { name: "¿Quitar a Grace Synthetic?" });
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Quitar" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Quién está en la organización" })).toHaveFocus(),
    );
    expect(remove.mock.calls[0]?.[1].get("memberId")).toBe("m2");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Grace Synthetic ya no está en la organización.",
    );
  });

  it("keeps the window open with the reason when removing is refused", async () => {
    const user = userEvent.setup();
    renderForOwner({ remove: async () => ({ error: "failed" }) });

    await user.click(
      screen.getByRole("button", { name: "Quitar a Hedy Synthetic de la organización" }),
    );
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Quitar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No pudimos guardar el cambio. Inténtalo de nuevo.",
    );
  });

  it("speaks English too", () => {
    renderWithIntl(
      <MembersList members={members} manage={{ changeRole: changed, remove: removed }} />,
      {
        locale: "en",
      },
    );

    expect(screen.getByRole("button", { name: "Make Grace Synthetic a viewer" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove Hedy Synthetic from the organization" }),
    ).toBeVisible();
  });
});
