import { describe, expect, it, vi } from "vitest";

import { hoursBasis, ratesBasis } from "./basis.fixtures";
import { developer, seatId, team } from "./change.fixtures";
import { SAVE_DELAY_MS, type SaveOutcome, type SaveRequest, createScenarioStore } from "./store";
import { createStoreRegistry } from "./store-registry";

// The scenario section keeps its stores (slice 3): the page asks for one on every render, and gets
// the same one while it shows the same scenario, under the template's id or the copy's.

const never = () => new Promise<SaveOutcome>(() => {});

const init = (
  scenarioId = seatId(99),
  basis = hoursBasis,
  save: (request: SaveRequest) => Promise<SaveOutcome> = never,
) => ({
  scenarioId,
  basis,
  team,
  version: 3,
  save,
});

describe("createStoreRegistry", () => {
  it("makes a store for the first scenario and gives it back while the scenario stays", () => {
    const registry = createStoreRegistry();
    const store = registry.obtain(init());
    expect(store.getState().scenarioId).toBe(seatId(99));
    expect(registry.obtain(init())).toBe(store);
  });

  it("keeps the store after the move to the copy, which it already knows by its new id", () => {
    const create = vi.fn(createScenarioStore);
    const registry = createStoreRegistry(create);
    const store = registry.obtain(init());
    store.setState({ scenarioId: seatId(98) });
    expect(registry.obtain(init(seatId(98)))).toBe(store);
    expect(create).toHaveBeenCalledOnce();
  });

  it("keeps the store for the template's page, which may render again after the save", () => {
    const registry = createStoreRegistry();
    const store = registry.obtain(init());
    store.setState({ scenarioId: seatId(98) });
    expect(registry.obtain(init())).toBe(store);
  });

  it("makes a store per scenario, and the one left keeps saving what it holds", async () => {
    vi.useFakeTimers();
    const saves: SaveRequest[] = [];
    const save = (request: SaveRequest) => {
      saves.push(request);
      return never();
    };
    const registry = createStoreRegistry();
    const first = registry.obtain(init(seatId(99), hoursBasis, save));
    first.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 50 } });

    const second = registry.obtain(init(seatId(98), hoursBasis, save));
    expect(second).not.toBe(first);
    expect(registry.obtain(init(seatId(99), hoursBasis, save))).toBe(first);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saves.map((request) => request.scenarioId)).toEqual([seatId(99)]);
    vi.useRealTimers();
  });

  it("makes a new store when the rate access changes, so no money outlives it", () => {
    const registry = createStoreRegistry();
    const withRates = registry.obtain(init(seatId(99), ratesBasis));
    const withoutRates = registry.obtain(init(seatId(99), hoursBasis));
    expect(withoutRates).not.toBe(withRates);
    expect(withoutRates.getState().basis.engine.rateAccess).toBe(false);
  });
});
