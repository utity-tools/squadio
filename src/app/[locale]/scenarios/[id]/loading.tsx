import { ScenarioShellSkeleton } from "@/components/scenario/scenario-shell";
import { AppShell } from "@/components/shell/app-shell";

// The shell stays put while the scenario loads; the trail and the account arrive with the page.
export default function Loading() {
  return (
    <AppShell scope="editor" current="inside-projects">
      <ScenarioShellSkeleton />
    </AppShell>
  );
}
