import { ScenarioStoreProvider } from "@/components/scenario/scenario-editor";

// The scenario store lives here, above `[id]`, so the redirect to the visitor's copy after the
// first save does not unmount it (ADR 0011, slice 3).
export default function ScenariosLayout({ children }: LayoutProps<"/[locale]/scenarios">) {
  return <ScenarioStoreProvider>{children}</ScenarioStoreProvider>;
}
