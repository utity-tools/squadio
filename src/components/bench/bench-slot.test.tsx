import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { benchSlot, useBenchSlot } from "./bench-slot";

/**
 * Stubs `matchMedia`: lg matches only while `large`, md always does. `resize` changes the width and
 * tells the listeners.
 */
function stubWidth(large: boolean) {
  const width = { large };
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === "(min-width: 64rem)" ? width.large : true;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    resize(next: boolean) {
      width.large = next;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe() {
  const slot = useBenchSlot();
  return <p>{slot ? `slot: ${slot.dataset.name}` : "no slot"}</p>;
}

function Page({ slots }: { slots: string[] }) {
  return (
    <>
      {slots.map((name) => (
        <div key={name} ref={benchSlot} data-name={name} />
      ))}
      <Probe />
    </>
  );
}

describe("the bench's slot for «Añadir al equipo…»", () => {
  it("is the place the bench registered, from lg", () => {
    stubWidth(true);
    render(<Page slots={["row"]} />);

    expect(screen.getByText("slot: row")).toBeInTheDocument();
  });

  it("is nowhere below lg, where the bench is hidden", () => {
    stubWidth(false);
    render(<Page slots={["row"]} />);

    expect(screen.getByText("no slot")).toBeInTheDocument();
  });

  it("follows the window across lg", () => {
    const screenSize = stubWidth(true);
    render(<Page slots={["row"]} />);

    act(() => screenSize.resize(false));
    expect(screen.getByText("no slot")).toBeInTheDocument();
    act(() => screenSize.resize(true));
    expect(screen.getByText("slot: row")).toBeInTheDocument();
  });

  it("is nowhere once the bench goes away", () => {
    stubWidth(true);
    const { rerender } = render(<Page slots={["row"]} />);
    rerender(<Page slots={[]} />);

    expect(screen.getByText("no slot")).toBeInTheDocument();
  });

  it("keeps a new place when the old one goes away after it", () => {
    stubWidth(true);
    const { rerender } = render(<Page slots={["old"]} />);
    // The new bench registers before the old one lets go.
    rerender(<Page slots={["new", "old"]} />);
    rerender(<Page slots={["new"]} />);

    expect(screen.getByText("slot: new")).toBeInTheDocument();
  });
});
