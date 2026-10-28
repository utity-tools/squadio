import { type ScenarioStore, type ScenarioStoreInit, createScenarioStore } from "./store";

// The scenario section keeps its stores above the scenario page (slice 3), so the redirect to the
// visitor's copy after the first save does not lose the history: the store already knows the
// copy's id, and the copy's page gets the same store back, as does the template's page if it
// renders again. One store per scenario and rate access, made the first time a page asks for it:
// asking again only finds it, so the page may ask on every render. A store is never thrown away
// while the section is open, so one the page left keeps saving what is left. One registry per
// render tree, never a module singleton, so two requests on the server never share a store.

export type StoreRegistry = {
  /** The store for this scenario and rate access, made from `init` if there is none yet. */
  obtain: (init: ScenarioStoreInit) => ScenarioStore;
};

export function createStoreRegistry(create = createScenarioStore): StoreRegistry {
  /** Each store with the id it was made for, which its page may still use after the move. */
  const stores: { madeFor: string; store: ScenarioStore }[] = [];
  return {
    obtain: (init) => {
      const { rateAccess } = init.basis.engine;
      const found = stores.find(({ madeFor, store }) => {
        const state = store.getState();
        return (
          state.basis.engine.rateAccess === rateAccess &&
          (madeFor === init.scenarioId || state.scenarioId === init.scenarioId)
        );
      });
      if (found) return found.store;
      const store = create(init);
      stores.push({ madeFor: init.scenarioId, store });
      return store;
    },
  };
}
