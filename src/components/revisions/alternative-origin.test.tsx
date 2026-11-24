import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { AlternativeOrigin, type AlternativeOriginProps } from "./alternative-origin";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// docs/domain.md, "Derived alternative" and "Retention": an alternative says which revision it came
// from and who proposed it; once that revision is deleted, that it came from a deleted one, and
// without an author, «antiguo miembro». Synthetic data only.

const REVISION = "6d656d6f-0000-4000-8000-000000000501";

const props = (
  overrides: Partial<AlternativeOriginProps["origin"]> = {},
): AlternativeOriginProps => ({
  origin: {
    revision: { id: REVISION, number: 2, scenarioName: "Plan A" },
    author: "Ada Synthetic",
    derivedAt: new Date("2026-10-28T12:00:00Z"),
    ...overrides,
  },
  anonymous: "formerMember",
  query: "",
});

const plain = (element: Element) => (element.textContent ?? "").replace(/[  ]/g, " ");

describe("AlternativeOrigin", () => {
  it("links to the revision it came from, with who proposed it and when in Madrid", async () => {
    renderWithIntl(<AlternativeOrigin {...props()} query="?access=none" />);

    const note = screen.getByRole("note");
    expect(plain(note)).toMatch(
      /^Alternativa de la revisión 2 de Plan A.*propuesta por Ada Synthetic.*28 oct 2026, 13:00$/,
    );
    expect(screen.getByRole("link", { name: "revisión 2 de Plan A" }).getAttribute("href")).toBe(
      `/revisions/${REVISION}?access=none`,
    );
    await expectNoAxeViolations();
  });

  it("says it came from a deleted revision, and names a former member or a visitor", () => {
    const { unmount } = renderWithIntl(
      <AlternativeOrigin {...props({ revision: null, author: null })} />,
    );
    expect(plain(screen.getByRole("note"))).toMatch(
      /^Alternativa de una revisión eliminada.*propuesta por antiguo miembro/,
    );
    expect(screen.queryByRole("link")).toBeNull();
    unmount();

    renderWithIntl(<AlternativeOrigin {...props({ author: null })} anonymous="visitor" />);
    expect(plain(screen.getByRole("note"))).toMatch(/propuesta por visitante/);
  });

  it("reads in English", () => {
    renderWithIntl(<AlternativeOrigin {...props()} />, { locale: "en" });
    expect(plain(screen.getByRole("note"))).toMatch(
      /^Alternative to revision 2 of Plan A.*proposed by Ada Synthetic/,
    );
  });
});
