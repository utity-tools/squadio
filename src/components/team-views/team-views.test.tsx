import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { layoutTeam } from "@/lib/layout/compact-layout";
import { assignmentCards } from "@/lib/team-tree/cards";
import { guideHours, guideSpan, guideTeam } from "@/test/guide-team";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";

import es from "../../../messages/es.json";
import { TeamViews } from "./team-views";

vi.mock("next/navigation", () => import("@/test/navigation"));

stubReactFlowLayout();

const layout = layoutTeam(guideTeam);
if (!layout.ok) throw new Error("expected a layout");

const data = {
  team: guideTeam.map(({ id, reportsTo }) => ({ id, reportsTo })),
  nodes: layout.nodes,
  cards: assignmentCards(guideTeam, guideHours, guideSpan),
};

const PATH = "/scenarios/guide";

/** Opens the views at `query` on a wide or a narrow screen. */
function open(query: string, { wide = true, deferred = false } = {}) {
  const screenSize = stubScreen({ wide });
  const replaceState = stubHistory(`${PATH}${query}`, { deferred });
  const view = renderWithIntl(<TeamViews {...data} />);
  return { replaceState, screenSize, rerender: view.rerender };
}

const tree = () => screen.queryByRole("application", { name: "Árbol del equipo" });
const table = () => screen.queryByRole("treegrid", { name: "Tabla del equipo" });
const option = (name: string) => screen.getByRole("radio", { name });
const node = (name: RegExp) => screen.getByRole("button", { name });
const row = (title: string) =>
  screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryAllByRole("gridcell")[0]?.textContent === title)!;
const bodyRows = () =>
  screen
    .getAllByRole("row")
    .filter((candidate) => candidate.dataset.row !== undefined && candidate.closest("tbody"));

/** The URL the last `replaceState` call wrote. */
const lastUrl = (replaceState: ReturnType<typeof stubHistory>) => replaceState.mock.lastCall?.[2];

describe("TeamViews", () => {
  it("offers the tree and the table as one named radio group", () => {
    open("");

    expect(screen.getByRole("radiogroup", { name: "Vista" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Árbol",
      "Tabla",
    ]);
  });

  it("shows the tree on a wide screen without a view in the URL", () => {
    open("");

    expect(tree()).toBeInTheDocument();
    expect(table()).not.toBeInTheDocument();
    expect(option("Árbol")).toBeChecked();
  });

  it("shows the table on a narrow screen without a view in the URL", () => {
    open("", { wide: false });

    expect(table()).toBeInTheDocument();
    expect(tree()).not.toBeInTheDocument();
    expect(option("Tabla")).toBeChecked();
  });

  it("keeps the default view once settled, when the screen crosses the breakpoint", () => {
    // Zooming to 200 % or turning a tablet must not unmount the view that has focus.
    const { screenSize } = open("");

    act(() => screenSize.resize(false));

    expect(tree()).toBeInTheDocument();
    expect(table()).not.toBeInTheDocument();
    expect(option("Árbol")).toBeChecked();
  });

  it("shows the view in the URL whatever the width", () => {
    open("?view=table");
    expect(table()).toBeInTheDocument();
    expect(tree()).not.toBeInTheDocument();
  });

  it("shows the tree from the URL on a narrow screen", () => {
    open("?view=tree", { wide: false });

    expect(tree()).toBeInTheDocument();
    expect(table()).not.toBeInTheDocument();
  });

  it("treats a view it does not know as absent", () => {
    open("?view=grid", { wide: false });

    expect(table()).toBeInTheDocument();
  });

  it("renders a placeholder until the width is known, and neither view", () => {
    stubScreen({ wide: true });
    stubHistory(PATH);

    const html = renderToString(
      <NextIntlClientProvider locale="es" messages={es} timeZone="Europe/Madrid">
        <TeamViews {...data} />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("data-team-placeholder");
    expect(html).not.toContain("treegrid");
    expect(html).not.toContain("react-flow");
    expect(html).not.toContain('aria-checked="true"');
  });

  it("writes the chosen view in the URL, keeping the other parameters and the focus", async () => {
    const { replaceState } = open("?a=1&collapsed=pm#team");

    await userEvent.click(option("Tabla"));

    expect(lastUrl(replaceState)).toBe(`${PATH}?a=1&collapsed=pm&view=table#team`);
    expect(table()).toBeInTheDocument();
    expect(option("Tabla")).toHaveFocus();
    expect(option("Tabla")).toBeChecked();
  });

  it("chooses a view with the arrow keys, as a radio group does", async () => {
    const { replaceState } = open("");
    await userEvent.tab();
    expect(option("Árbol")).toHaveFocus();

    // A quick press: the key is up again before Radix moves the focus, a tick later.
    await userEvent.keyboard("{ArrowRight}");
    await vi.waitFor(() => expect(option("Tabla")).toHaveFocus());

    expect(option("Tabla")).toHaveFocus();
    expect(option("Tabla")).toBeChecked();
    expect(table()).toBeInTheDocument();
    expect(lastUrl(replaceState)).toBe(`${PATH}?view=table`);
  });

  it("keeps the view when its option is chosen again", async () => {
    const { replaceState } = open("?view=tree");

    await userEvent.click(option("Árbol"));

    expect(replaceState).not.toHaveBeenCalled();
    expect(tree()).toBeInTheDocument();
  });

  it("reads the collapsed rows from the URL, dropping ids not in the team", () => {
    open("?view=table&collapsed=gone,pm");

    expect(bodyRows()).toHaveLength(1);
    expect(row("Project manager")).toHaveAttribute("aria-expanded", "false");
  });

  it("writes the collapsed rows in the URL and removes the parameter when none are", async () => {
    const { replaceState } = open("?view=table&a=1");
    await userEvent.tab();
    await userEvent.tab();
    expect(row("Project manager")).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(lastUrl(replaceState)).toBe(`${PATH}?view=table&a=1&collapsed=pm`);
    expect(bodyRows()).toHaveLength(1);

    await userEvent.keyboard("{ArrowRight}");
    expect(lastUrl(replaceState)).toBe(`${PATH}?view=table&a=1`);
    expect(bodyRows()).toHaveLength(4);
  });

  it("keeps up with fast keys while the URL catches up", async () => {
    const { replaceState } = open("?view=table", { deferred: true });
    await userEvent.tab();
    await userEvent.tab();
    expect(row("Project manager")).toHaveFocus();

    // Collapsing hides the reports at once: Down skips them and lands on the totals.
    await userEvent.keyboard("{ArrowLeft}{ArrowDown}");

    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole("rowheader", { name: "Total" }).closest("tr")).toHaveFocus();
    expect(lastUrl(replaceState)).toBe(`${PATH}?view=table&collapsed=pm`);
    act(() => replaceState.flush());
    expect(bodyRows()).toHaveLength(1);
  });

  it("writes every fast chevron click in the URL", async () => {
    const { replaceState } = open("?view=table", { deferred: true });
    const chevron = () => row("Project manager").querySelector<HTMLElement>("[data-toggle]")!;

    await userEvent.click(chevron());
    await userEvent.click(chevron());

    expect(bodyRows()).toHaveLength(4);
    expect(lastUrl(replaceState)).toBe(`${PATH}?view=table`);
  });

  it("expands the managers above the selection when switching to the table", async () => {
    const { replaceState } = open("?collapsed=pm");

    fireEvent.click(node(/^DevOps/));
    await userEvent.click(option("Tabla"));

    expect(row("Project manager")).toHaveAttribute("aria-expanded", "true");
    expect(row("DevOps engineer")).toHaveAttribute("aria-selected", "true");
    expect(row("DevOps engineer")).toHaveAttribute("tabindex", "0");
    expect(lastUrl(replaceState)).toBe(`${PATH}?view=table`);
  });

  it("forgets a selection that is no longer in the team", async () => {
    const { rerender } = open("");
    fireEvent.click(node(/^DevOps/));
    const smaller = guideTeam.filter(({ id }) => id !== "ops");
    const smallerLayout = layoutTeam(smaller);
    if (!smallerLayout.ok) throw new Error("expected a layout");

    rerender(
      <NextIntlClientProvider locale="es" messages={es} timeZone="Europe/Madrid">
        <TeamViews
          team={smaller.map(({ id, reportsTo }) => ({ id, reportsTo }))}
          nodes={smallerLayout.nodes}
          cards={assignmentCards(smaller, guideHours, guideSpan)}
        />
      </NextIntlClientProvider>,
    );

    expect(node(/^Project manager/)).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("button", { current: true })).not.toBeInTheDocument();
    await userEvent.click(option("Tabla"));
    expect(row("Project manager")).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("row", { selected: true })).not.toBeInTheDocument();
  });

  it("keeps the selection when switching views, both ways", async () => {
    open("");

    // A plain click: user-event's mousedown would start d3-zoom's pan, which jsdom cannot run.
    fireEvent.click(node(/^DevOps/));
    await userEvent.click(option("Tabla"));

    expect(row("DevOps engineer")).toHaveAttribute("aria-selected", "true");
    expect(row("DevOps engineer")).toHaveAttribute("tabindex", "0");
    expect(row("Project manager")).toHaveAttribute("aria-selected", "false");

    await userEvent.click(within(row("Tech lead")).getAllByRole("gridcell")[2]!);
    await userEvent.click(option("Árbol"));

    expect(node(/^Tech lead/)).toHaveAttribute("aria-current", "true");
    expect(node(/^Tech lead/)).toHaveAttribute("tabindex", "0");
  });

  it("names the views in English", () => {
    stubScreen({ wide: true });
    stubHistory(PATH);
    renderWithIntl(<TeamViews {...data} />, { locale: "en" });

    expect(screen.getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tree" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Table" })).not.toBeChecked();
  });
});
