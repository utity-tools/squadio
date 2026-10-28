import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CountUp } from "./count-up";

const euros = (cents: number) => `${Math.round(cents / 100)} €`;

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query.includes("reduce") && reduce,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CountUp", () => {
  it("starts at its value, as the server rendered it", () => {
    render(<CountUp value={120_000} format={euros} />);
    expect(screen.getByText("1200 €")).toBeInTheDocument();
  });

  it("counts to a new value", async () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<CountUp value={120_000} format={euros} />);
    rerender(<CountUp value={240_000} format={euros} />);

    expect(container).toHaveTextContent("1200 €");
    const seen = new Set<string>();
    await waitFor(() => {
      seen.add(container.textContent);
      expect(container).toHaveTextContent("2400 €");
    });
    expect(seen.size).toBeGreaterThan(1);
  });

  it("swaps at once with reduced motion", async () => {
    stubReducedMotion(true);
    const { container, rerender } = render(<CountUp value={120_000} format={euros} />);
    rerender(<CountUp value={240_000} format={euros} />);
    await waitFor(() => expect(container).toHaveTextContent("2400 €"), { timeout: 50 });
  });
});
