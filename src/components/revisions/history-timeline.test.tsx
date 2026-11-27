import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AlternativeOrigin } from "@/db/load-alternative-origin";
import type { RevisionLine } from "@/db/load-revisions";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { HistoryTimeline } from "./history-timeline";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// docs/domain.md, "Revisions" and "Derived alternative", and ADR 0017: the card's «Historial» tab
// shows a scenario's history as a pull request's timeline, newest on top: who made each revision,
// why and when in Madrid, the one chosen in the brand's colour and, at the start, where an
// alternative came from. Only what is stored: who chose an older revision, and when, is not
// (docs/domain.md, "Choosing a revision"). Synthetic data only.

const SECOND = "6d656d6f-0000-4000-8000-000000000502";
const FIRST = "6d656d6f-0000-4000-8000-000000000501";
const SOURCE = "6d656d6f-0000-4000-8000-000000000401";

const lines: RevisionLine[] = [
  {
    id: SECOND,
    number: 2,
    // 23:30 in UTC is already the 24th in Madrid.
    madeAt: new Date("2026-11-23T23:30:00Z"),
    reason: "saved",
    author: "Ada Synthetic",
    chosen: false,
  },
  {
    id: FIRST,
    number: 1,
    madeAt: new Date("2026-10-28T12:00:00Z"),
    reason: "chosen",
    author: null,
    chosen: true,
  },
];

const origin: AlternativeOrigin = {
  revision: { id: SOURCE, number: 3, scenarioName: "Plan A" },
  author: "Grace Synthetic",
  derivedAt: new Date("2026-10-20T08:15:00Z"),
};

const plain = (element: Element) => (element.textContent ?? "").replace(/[\u00a0\u202f]/g, " ");
const timeline = () => screen.getByRole("list", { name: "Historial" });
const steps = () => within(timeline()).getAllByRole("listitem");

describe("HistoryTimeline", () => {
  it("tells each revision, newest first, with who, why and Madrid's date and time", () => {
    renderWithIntl(<HistoryTimeline revisions={lines} anonymous="visitor" />);

    expect(steps().map(plain)).toEqual([
      expect.stringMatching(/^Ada Synthetic guardó la revisión 2\s*Última\s*24 nov 2026, 0:30$/),
      expect.stringMatching(
        /^visitante eligió el escenario con la revisión 1\s*Elegida\s*28 oct 2026, 13:00$/,
      ),
    ]);
    expect(steps()[0]?.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-11-23T23:30:00.000Z",
    );
    // The author stands out in the sentence.
    expect(within(steps()[0]!).getByText("Ada Synthetic")).toHaveClass("font-semibold");
  });

  it.each([
    ["saved", "Ada Synthetic guardó la revisión 4"],
    ["shared", "Ada Synthetic compartió la revisión 4"],
    ["chosen", "Ada Synthetic eligió el escenario con la revisión 4"],
    ["migrated", "La revisión 4 llegó de una versión anterior de Squadio"],
  ] as const)("says why a revision was %s", (reason, text) => {
    renderWithIntl(
      <HistoryTimeline
        revisions={[{ ...lines[0]!, number: 4, reason }]}
        anonymous="formerMember"
      />,
    );

    expect(plain(steps()[0]!)).toContain(text);
  });

  it("marks the chosen revision in the brand's colour, and the newest as the latest", () => {
    renderWithIntl(<HistoryTimeline revisions={lines} anonymous="visitor" />);

    const [newest, chosen] = steps();
    expect(within(newest!).getByText("Última")).toHaveAttribute("data-slot", "chip");
    expect(within(newest!).queryByText("Elegida")).toBeNull();
    expect(within(chosen!).getByText("Elegida")).toHaveAttribute("data-tone", "chosen");
    expect(within(chosen!).queryByText("Última")).toBeNull();
    // The dot is decoration: the chip says it.
    const dot = chosen!.querySelector("span[aria-hidden].rounded-full");
    expect(dot).toHaveClass("bg-brand-solid");
    expect(newest!.querySelector("span[aria-hidden].rounded-full")).not.toHaveClass(
      "bg-brand-solid",
    );
    for (const icon of timeline().querySelectorAll("svg")) {
      expect(icon.closest("[aria-hidden]")).not.toBeNull();
    }
  });

  it("links each revision to its page, keeping the query", () => {
    renderWithIntl(<HistoryTimeline revisions={lines} anonymous="visitor" query="?access=none" />);

    expect(screen.getByRole("link", { name: "revisión 2" })).toHaveAttribute(
      "href",
      `/revisions/${SECOND}?access=none`,
    );
    expect(screen.getByRole("link", { name: "revisión 1" })).toHaveAttribute(
      "href",
      `/revisions/${FIRST}?access=none`,
    );
  });

  it("ends with where an alternative came from, in the alternative's colour", () => {
    renderWithIntl(
      <HistoryTimeline
        revisions={lines}
        origin={origin}
        anonymous="visitor"
        query="?access=none"
      />,
    );

    const last = steps().at(-1)!;
    expect(steps()).toHaveLength(3);
    expect(plain(last)).toMatch(
      /^Grace Synthetic propuso esta alternativa a partir de Plan A · revisión 3\s*20 oct 2026, 10:15$/,
    );
    expect(within(last).getByRole("link", { name: "Plan A · revisión 3" })).toHaveAttribute(
      "href",
      `/revisions/${SOURCE}?access=none`,
    );
    expect(last.querySelector("span[aria-hidden].rounded-full")).toHaveClass("bg-alt");
  });

  it("says an alternative came from a deleted revision, without its author once gone", () => {
    renderWithIntl(
      <HistoryTimeline
        revisions={[]}
        origin={{ ...origin, revision: null, author: null }}
        anonymous="formerMember"
      />,
    );

    expect(steps()).toHaveLength(1);
    expect(plain(steps()[0]!)).toMatch(
      /^antiguo miembro propuso esta alternativa a partir de una revisión ya eliminada/,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says when there is no history yet, and how to start it", () => {
    renderWithIntl(<HistoryTimeline revisions={[]} anonymous="visitor" />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("Todavía no hay historial")).toBeInTheDocument();
    expect(
      screen.getByText("«Guardar revisión» hace una foto del escenario, que aparecerá aquí."),
    ).toBeInTheDocument();
  });

  it("reads in English", () => {
    renderWithIntl(<HistoryTimeline revisions={lines} origin={origin} anonymous="formerMember" />, {
      locale: "en",
    });

    const texts = screen.getAllByRole("listitem").map(plain);
    expect(screen.getByRole("list", { name: "History" })).toBeInTheDocument();
    expect(texts[0]).toMatch(/^Ada Synthetic saved revision 2\s*Latest/);
    expect(texts[1]).toMatch(/^former member chose the scenario with revision 1\s*Chosen/);
    expect(texts[2]).toMatch(/^Grace Synthetic proposed this alternative from Plan A · revision 3/);
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<HistoryTimeline revisions={lines} origin={origin} anonymous="visitor" />);
    await expectNoAxeViolations();
  });
});
