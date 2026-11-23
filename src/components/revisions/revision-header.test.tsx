import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { RevisionHeader, type RevisionHeaderProps } from "./revision-header";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// docs/domain.md, "Sharing a revision": the page says which revision it is, who made it, when and
// why, links to its scenario, and says when the scenario has a newer one, without saying what
// changed. Synthetic data only.

const SCENARIO = "6d656d6f-0000-4000-8000-000000000200";
const FIRST = "6d656d6f-0000-4000-8000-000000000501";
const SECOND = "6d656d6f-0000-4000-8000-000000000502";

const props = (overrides: Partial<RevisionHeaderProps["revision"]> = {}): RevisionHeaderProps => ({
  revision: {
    id: FIRST,
    scenarioId: SCENARIO,
    number: 1,
    madeAt: new Date("2026-10-28T12:00:00Z"),
    reason: "saved",
    author: "Ada Synthetic",
    latest: { id: FIRST, number: 1 },
    ...overrides,
  },
  scenarioName: "Plan A",
  anonymous: "formerMember",
  query: "",
});

const plain = (element: Element) => (element.textContent ?? "").replace(/[  ]/g, " ");

describe("RevisionHeader", () => {
  it("names the revision and its scenario, with who made it, when in Madrid and why", () => {
    renderWithIntl(<RevisionHeader {...props()} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Plan A · Revisión 1");
    expect(plain(screen.getByTestId("revision-meta"))).toMatch(
      /^28 oct 2026, 13:00.*Ada Synthetic.*guardada$/,
    );
    expect(screen.getByText("Solo lectura: una revisión nunca cambia.")).toBeTruthy();
  });

  it("links to its scenario, keeping the query", () => {
    renderWithIntl(<RevisionHeader {...props()} query="?access=none" />);

    expect(screen.getByRole("link", { name: "Abrir el escenario" }).getAttribute("href")).toBe(
      `/scenarios/${SCENARIO}?access=none`,
    );
  });

  it("says nothing of a newer revision when it is the latest", () => {
    renderWithIntl(<RevisionHeader {...props()} />);

    expect(screen.queryByText(/revisión más nueva/)).toBeNull();
  });

  it("says when the scenario has a newer revision and links to it, not what changed", () => {
    renderWithIntl(<RevisionHeader {...props({ latest: { id: SECOND, number: 2 } })} />);

    const note = screen.getByRole("note");
    expect(plain(note)).toBe("Este escenario tiene una revisión más nueva. Ver la revisión 2");
    expect(screen.getByRole("link", { name: "Ver la revisión 2" }).getAttribute("href")).toBe(
      `/revisions/${SECOND}`,
    );
  });

  it("names a revision without author as the page's anonymous author", () => {
    renderWithIntl(<RevisionHeader {...props({ author: null })} anonymous="visitor" />);

    expect(plain(screen.getByTestId("revision-meta"))).toContain("visitante");
  });

  it("reads in English", () => {
    renderWithIntl(
      <RevisionHeader {...props({ reason: "chosen", latest: { id: SECOND, number: 2 } })} />,
      { locale: "en" },
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Plan A · Revision 1");
    expect(plain(screen.getByTestId("revision-meta"))).toMatch(/chosen$/);
    expect(screen.getByRole("link", { name: "Open the scenario" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See revision 2" })).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<RevisionHeader {...props({ latest: { id: SECOND, number: 2 } })} />);
    await expectNoAxeViolations();
  });
});
