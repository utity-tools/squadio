import { useEffect } from "react";

import { useScenarioStore } from "@/components/scenario/scenario-editor";
import type { ScenarioStore } from "@/lib/scenarios/store";

/** Hands a test the store a ScenarioEditor gives its views. */
export function StoreSpy({ onStore }: { onStore: (store: ScenarioStore) => void }) {
  const store = useScenarioStore();
  useEffect(() => {
    onStore(store);
  }, [onStore, store]);
  return null;
}
