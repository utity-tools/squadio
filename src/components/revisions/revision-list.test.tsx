import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RevisionLine } from "@/db/load-revisions";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { RevisionList } from "./revision-list";

// docs/domain.md, "Revisions": the summary rail lists a scenario's revisions, newest first, with
// who made them, when and why. Synthetic data only.

const lines: RevisionLine[] = [
  {
    id: "6d656d6f-0000-4000-8000-000000000502",
    number: 2,
    // 23:30 in UTC is already the 24th in Madrid.
    madeAt: new Date("2026-11-23T23:30:00Z"),
    reason: "saved",
    author: "Ada Synthetic",
  },
  {
    id: "6d656d6f-0000-4000-8000-000000000501",
    number: 1,
    madeAt: new Date("2026-10-28T12:00:00Z"),
    reason: "chosen",
    author: null,
  },
];

const plain = (element: Element) => (element.textContent ?? "").replace(/[\u00a0\u202f]/g, " ");

describe("RevisionList", () => {
  it("lists each revision with its number, Madrid's date and time, its author and why", () => {
    renderWithIntl(<RevisionList revisions={lines} anonymous="visitor" />);

    const region = within(screen.getByRole("region", { name: "Revisiones" }));
    const items = region.getAllByRole("listitem");
    expect(items.map(plain)).toEqual([
      expect.stringMatching(/^Revisión 2.*24 nov 2026, 0:30.*Ada Synthetic.*guardada$/),
      expect.stringMatching(/^Revisión 1.*28 oct 2026.*13:00.*visitante.*elegida$/),
    ]);
    expect(items[0]?.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-11-23T23:30:00.000Z",
    );
  });

  it("names a revision without author a former member's outside the demo and its copies", () => {
    renderWithIntl(<RevisionList revisions={lines} anonymous="formerMember" />);

    expect(plain(screen.getAllByRole("listitem")[1]!)).toContain("antiguo miembro");
  });

  it("says when there is none yet", () => {
    renderWithIntl(<RevisionList revisions={[]} anonymous="visitor" />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("Todavía no hay revisiones de este escenario.")).toBeTruthy();
  });

  it("reads in English", () => {
    renderWithIntl(<RevisionList revisions={lines} anonymous="formerMember" />, { locale: "en" });

    const items = screen.getAllByRole("listitem").map(plain);
    expect(items[0]).toMatch(/^Revision 2.*Ada Synthetic.*saved$/);
    expect(items[1]).toMatch(/^Revision 1.*former member.*chosen$/);
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<RevisionList revisions={lines} anonymous="visitor" />);
    await expectNoAxeViolations();
  });
});
