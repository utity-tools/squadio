import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { CONNECTION_BACK_MS, ConnectionBanner } from "./connection-banner";

// Under the top bar (Errors board, section 5): amber, not red, since nobody is to blame and it
// mends itself, while the network is down; «Conexión recuperada» for 3 s when it comes back.

let online = true;

beforeEach(() => {
  online = true;
  vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function go(state: "online" | "offline") {
  act(() => {
    online = state === "online";
    window.dispatchEvent(new Event(state));
  });
}

const region = () => screen.getByRole("status");

describe("ConnectionBanner", () => {
  it("says nothing while online, in a status region already there to be heard", () => {
    renderWithIntl(<ConnectionBanner />);

    expect(region()).toBeEmptyDOMElement();
  });

  it("says, in amber, that nothing can be saved while the connection is down", () => {
    renderWithIntl(<ConnectionBanner />);
    go("offline");

    expect(region()).toHaveTextContent("Sin conexión. No se puede guardar hasta que vuelva.");
    expect(region().firstElementChild).toHaveClass("tint-warn");
    expect(screen.getByText("Sin conexión.")).toHaveClass("font-semibold", "text-status-warn-text");
  });

  it("starts offline when the page loads without a connection", () => {
    online = false;
    renderWithIntl(<ConnectionBanner />);

    expect(region()).toHaveTextContent("Sin conexión.");
  });

  it("says the connection is back for 3 s, then goes", () => {
    renderWithIntl(<ConnectionBanner />);
    go("offline");
    go("online");

    expect(region()).toHaveTextContent("Conexión recuperada");
    act(() => vi.advanceTimersByTime(CONNECTION_BACK_MS - 1));
    expect(region()).toHaveTextContent("Conexión recuperada");
    act(() => vi.advanceTimersByTime(1));
    expect(region()).toBeEmptyDOMElement();
    expect(CONNECTION_BACK_MS).toBe(3000);
  });

  it("goes back to offline if the connection drops again before the 3 s end", () => {
    renderWithIntl(<ConnectionBanner />);
    go("offline");
    go("online");
    go("offline");
    act(() => vi.advanceTimersByTime(CONNECTION_BACK_MS));

    expect(region()).toHaveTextContent("Sin conexión.");
  });

  it("has no detectable accessibility violations while offline", async () => {
    vi.useRealTimers();
    renderWithIntl(<ConnectionBanner />);
    go("offline");

    await expectNoAxeViolations();
  });
});
