import { afterAll, beforeAll, vi } from "vitest";

const offsets = ["offsetWidth", "offsetHeight"] as const;

/**
 * Gives jsdom what React Flow measures, for the tests of a file that draws the canvas: a resize
 * observer, a transform matrix and node sizes. Call it at the top of the file.
 */
export function stubReactFlowLayout() {
  const originals = offsets.map((name) =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
  );

  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "DOMMatrixReadOnly",
      class {
        m22 = 1;
      },
    );
    // Nodes stay hidden until React Flow has measured them.
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: { configurable: true, get: () => 240 },
      offsetHeight: { configurable: true, get: () => 120 },
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    offsets.forEach((name, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(HTMLElement.prototype, name, original);
    });
  });
}
