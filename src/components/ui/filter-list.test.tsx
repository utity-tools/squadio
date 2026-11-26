import { act, renderHook } from "@testing-library/react";

import { stubHistory } from "@/test/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useListQuery } from "./filter-list";

vi.mock("next/navigation", () => import("@/test/navigation"));

// A list's state lives in the URL (ADR 0017): a tab, order or filter is a new history entry, so
// Back undoes it; each key of a search replaces the entry; Back and Forward read the URL again.

type Query = { tab: string; q: string };
const read = (query: URLSearchParams): Query => ({
  tab: query.get("tab") ?? "all",
  q: query.get("q") ?? "",
});
const write = (current: URLSearchParams, query: Query) => {
  const next = new URLSearchParams(current);
  for (const [name, value, fallback] of [
    ["tab", query.tab, "all"],
    ["q", query.q, ""],
  ] as const) {
    if (value === fallback) next.delete(name);
    else next.set(name, value);
  }
  const text = next.toString();
  return text ? `?${text}` : "";
};

beforeEach(() => {
  window.history.replaceState(null, "", "/people?access=none&tab=free");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useListQuery", () => {
  it("starts from the URL", () => {
    const { result } = renderHook(() => useListQuery(read, write));
    expect(result.current[0]).toEqual({ tab: "free", q: "" });
  });

  it("pushes a tab, replaces a search, and keeps every other parameter", () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useListQuery(read, write));

    act(() => result.current[1]({ tab: "over", q: "" }));
    expect(push).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?access=none&tab=over");

    act(() => result.current[1]({ tab: "over", q: "ana" }, "replace"));
    expect(replace).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?access=none&tab=over&q=ana");
    expect(result.current[0]).toEqual({ tab: "over", q: "ana" });
  });

  it("adds no history entry when the URL would not change, as a tab chosen twice", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useListQuery(read, write));

    act(() => result.current[1]({ tab: "free", q: "" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("reads the URL again on Back and Forward", () => {
    const { result } = renderHook(() => useListQuery(read, write));

    act(() => {
      window.history.replaceState(null, "", "/people?tab=inactive");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toEqual({ tab: "inactive", q: "" });
  });

  it("follows the URL when a link changes it, but not when it is its own write", () => {
    stubHistory("/people?tab=free");
    const { result } = renderHook(() => useListQuery(read, write));

    // Its own writes, even while the URL lags behind a fast search, never turn the state back.
    act(() => result.current[1]({ tab: "free", q: "a" }, "replace"));
    act(() => result.current[1]({ tab: "free", q: "an" }, "replace"));
    expect(result.current[0]).toEqual({ tab: "free", q: "an" });

    // A link to the plain list, as the sidebar's.
    act(() => window.history.replaceState(null, "", "/people"));
    expect(result.current[0]).toEqual({ tab: "all", q: "" });
  });
});
