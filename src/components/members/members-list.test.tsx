import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MemberRow } from "@/db/members";
import { renderWithIntl } from "@/test/render";

import { MembersList } from "./members-list";

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
