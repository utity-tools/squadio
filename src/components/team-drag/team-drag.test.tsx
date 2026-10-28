import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Bench } from "@/components/bench/bench";
import { ScenarioEditor, ScenarioStoreProvider } from "@/components/scenario/scenario-editor";
import { LiveScenarioTeam } from "@/components/scenario/scenario-live";
import { hoursBasis } from "@/lib/scenarios/basis.fixtures";
import type { Member } from "@/lib/scenarios/change";
import { SENIOR, personId, seatId, team } from "@/lib/scenarios/change.fixtures";
import type { SaveOutcome, ScenarioStore } from "@/lib/scenarios/store";
import { stubHistory, stubScreen } from "@/test/navigation";
import { stubReactFlowLayout } from "@/test/react-flow";
import { renderWithIntl } from "@/test/render";
import { StoreSpy } from "@/test/store-spy";

vi.mock("next/navigation", () => import("@/test/navigation"));

stubReactFlowLayout();

// ADR 0008, point 1: one pointer-events layer drags people from the bench into the team, and
// assignments inside it. jsdom lays nothing out, so `elementFromPoint` returns what `pointAt` says.
// The team of change.fixtures.ts: the manager (Role 1) has the lead (Role 2) and the designer
// (Role 4) under them; the tester (Role 5) reports to the designer. Person 2 is on the bench only.

let under: Element | null = null;
const pointAt = (element: Element | null) => void (under = element);

afterEach(() => {
  under = null;
});

function renderPage({
  wide = true,
  chosen = false,
  members = team,
}: { wide?: boolean; chosen?: boolean; members?: Member[] } = {}) {
  stubScreen({ wide });
  stubHistory("/scenarios/plan?view=tree");
  document.elementFromPoint = () => under;
  const stores: ScenarioStore[] = [];
  const basis = { ...hoursBasis, scenario: { ...hoursBasis.scenario, chosen } };
  const view = renderWithIntl(
    <ScenarioStoreProvider>
      <ScenarioEditor
        scenarioId={seatId(99)}
        editing={{ basis, team: members, version: 1 }}
        save={() => new Promise<SaveOutcome>(() => {})}
      >
        <Bench />
        <LiveScenarioTeam />
        <StoreSpy onStore={(store) => void stores.push(store)} />
      </ScenarioEditor>
    </ScenarioStoreProvider>,
  );
  const store = stores[0];
  if (!store) throw new Error("expected a store");
  return { ...view, store };
}

const node = (role: string) => screen.getByRole("button", { name: new RegExp(`^${role},`) });
const benchCard = (name: string) =>
  screen
    .getAllByText(name)
    .find((text) => text.closest("[data-bench-person]"))!
    .closest("li")!;
const gripOf = (element: HTMLElement) =>
  element.closest(".react-flow__node")?.querySelector<HTMLElement>("[data-drag-grip]") ?? null;
const canvas = () => document.querySelector<HTMLElement>("[data-drop-root]")!;

const pointer = { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse" };

/** Presses on `from`, moves past the threshold over `to`, and lets go there. */
function drag(from: HTMLElement, to: Element | null, { drop = true } = {}) {
  fireEvent.pointerDown(from, { ...pointer, clientX: 10, clientY: 10 });
  pointAt(to);
  fireEvent.pointerMove(window, { ...pointer, clientX: 40, clientY: 40 });
  if (drop) fireEvent.pointerUp(window, { ...pointer, clientX: 40, clientY: 40 });
}

const memberOf = (store: ScenarioStore, person: string) =>
  store.getState().history.team.find((member) => member.personId === person);

describe("dragging from the bench", () => {
  it("adds the person under the node they are dropped on, and focuses the new node", async () => {
    const { store } = renderPage();

    drag(benchCard("Person 2"), node("Role 4"));

    // The defaults of "Add to team…": the category's name and 100%.
    expect(memberOf(store, personId(2))).toMatchObject({
      reportsTo: seatId(4),
      categoryId: SENIOR,
      projectRole: "Senior Developer",
      allocation: 100,
    });
    await waitFor(() => expect(node("Senior Developer")).toHaveFocus());
  });

  it("adds the person at the top of the team when dropped on the canvas", () => {
    const { store } = renderPage();

    drag(benchCard("Person 2"), canvas());

    expect(memberOf(store, personId(2))?.reportsTo).toBeNull();
  });

  it("starts an empty team from its empty state", () => {
    const { store } = renderPage({ members: [] });

    drag(benchCard("Person 2"), screen.getByRole("heading", { name: /equipo/i }));

    expect(memberOf(store, personId(2))?.reportsTo).toBeNull();
  });

  it("does nothing when dropped outside the team", () => {
    const { store } = renderPage();

    drag(benchCard("Person 2"), document.body);

    expect(memberOf(store, personId(2))).toBeUndefined();
    expect(store.getState().history.cursor).toBe(0);
  });

  it("shows what is dragged under the pointer, and highlights only a zone that takes it", () => {
    renderPage();

    drag(benchCard("Person 2"), node("Role 4"), { drop: false });
    expect(document.querySelector("[data-drag-ghost]")).toHaveTextContent("Person 2");
    expect(node("Role 4")).toHaveAttribute("data-drop-target");

    fireEvent.pointerUp(window, { ...pointer, clientX: 40, clientY: 40 });
    expect(document.querySelector("[data-drag-ghost]")).toBeNull();
    expect(node("Role 4")).not.toHaveAttribute("data-drop-target");
  });

  it("cancels with Escape", () => {
    const { store } = renderPage();

    drag(benchCard("Person 2"), node("Role 4"), { drop: false });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { ...pointer, clientX: 40, clientY: 40 });

    expect(memberOf(store, personId(2))).toBeUndefined();
    expect(document.querySelector("[data-drag-ghost]")).toBeNull();
  });

  it("does not drag on a press that does not move", () => {
    const { store } = renderPage();

    fireEvent.pointerDown(benchCard("Person 2"), { ...pointer, clientX: 10, clientY: 10 });
    pointAt(node("Role 4"));
    fireEvent.pointerMove(window, { ...pointer, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(window, { ...pointer, clientX: 12, clientY: 11 });

    expect(memberOf(store, personId(2))).toBeUndefined();
  });

  it("drags with a finger only from the grip, so the bench still scrolls", () => {
    const { store } = renderPage();
    const touch = { ...pointer, pointerType: "touch" };

    fireEvent.pointerDown(benchCard("Person 2"), { ...touch, clientX: 10, clientY: 10 });
    pointAt(node("Role 4"));
    fireEvent.pointerMove(window, { ...touch, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { ...touch, clientX: 40, clientY: 40 });
    expect(memberOf(store, personId(2))).toBeUndefined();

    const grip = benchCard("Person 2").querySelector<HTMLElement>("[data-drag-grip]")!;
    fireEvent.pointerDown(grip, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { ...touch, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { ...touch, clientX: 40, clientY: 40 });
    expect(memberOf(store, personId(2))?.reportsTo).toBe(seatId(4));
  });

  it("does nothing when dropped on the canvas's zoom buttons", () => {
    const { store } = renderPage();

    drag(benchCard("Person 2"), screen.getByRole("button", { name: "Acercar" }));

    expect(memberOf(store, personId(2))).toBeUndefined();
  });

  it("offers no grip for someone already on the team", () => {
    renderPage();

    expect(benchCard("Person 2").querySelector("[data-drag-grip]")).not.toBeNull();
    expect(benchCard("Person 1").querySelector("[data-drag-grip]")).toBeNull();
  });
});

describe("dragging an open role from the bench", () => {
  const openRoleCard = (category: string) =>
    [...document.querySelectorAll<HTMLElement>("[data-bench-open-role]")].find(
      (card) => card.closest("div")?.querySelector("h3 span")?.textContent === category,
    )!;
  const openRolesOf = (store: ScenarioStore, categoryId: string) =>
    store
      .getState()
      .history.team.filter(
        (member) => member.personId === null && member.categoryId === categoryId,
      );

  it("adds an open role of the category under the node, as often as it is dropped", () => {
    const { store } = renderPage();
    const before = new Set(openRolesOf(store, SENIOR).map((member) => member.id));

    drag(openRoleCard("Senior Developer"), node("Role 2"));
    drag(openRoleCard("Senior Developer"), canvas());

    const added = openRolesOf(store, SENIOR).filter((member) => !before.has(member.id));
    expect(added).toHaveLength(2);
    expect(added.map((member) => [member.reportsTo, member.projectRole])).toEqual(
      expect.arrayContaining([
        [seatId(2), "Senior Developer"],
        [null, "Senior Developer"],
      ]),
    );
  });

  it("shows the open role and its category under the pointer", () => {
    renderPage();

    drag(openRoleCard("Project Manager"), node("Role 4"), { drop: false });
    expect(document.querySelector("[data-drag-ghost]")).toHaveTextContent(
      "Vacante (Project Manager)",
    );
    expect(openRoleCard("Project Manager").className).toContain("border-primary");
    fireEvent.pointerUp(window, { ...pointer, clientX: 40, clientY: 40 });
  });
});

describe("dragging inside the tree", () => {
  it("moves an assignment under the node it is dropped on", () => {
    const { store } = renderPage();

    drag(gripOf(node("Role 4"))!, node("Role 2"));

    const designer = store.getState().history.team.find((member) => member.id === seatId(4));
    expect(designer?.reportsTo).toBe(seatId(2));
  });

  it("moves an assignment to the top when dropped on the canvas", () => {
    const { store } = renderPage();

    drag(gripOf(node("Role 4"))!, canvas());

    const designer = store.getState().history.team.find((member) => member.id === seatId(4));
    expect(designer?.reportsTo).toBeNull();
  });

  it("takes no step, and highlights nothing, over its own report", () => {
    const { store } = renderPage();

    drag(gripOf(node("Role 4"))!, node("Role 5"), { drop: false });
    expect(node("Role 5")).not.toHaveAttribute("data-drop-target");
    fireEvent.pointerUp(window, { ...pointer, clientX: 40, clientY: 40 });

    expect(store.getState().history.cursor).toBe(0);
  });
});

describe("where nothing can be dragged", () => {
  it("offers no grips for a chosen scenario", () => {
    renderPage({ chosen: true });

    expect(document.querySelector("[data-drag-grip]")).toBeNull();
    expect(document.querySelector("[data-drop-root]")).toBeNull();
  });

  it("takes no drops on a narrow screen, where the team is read-only", () => {
    const { store } = renderPage({ wide: false });

    expect(gripOf(node("Role 4"))).toBeNull();
    drag(benchCard("Person 2"), node("Role 4"));
    expect(memberOf(store, personId(2))).toBeUndefined();
  });
});
