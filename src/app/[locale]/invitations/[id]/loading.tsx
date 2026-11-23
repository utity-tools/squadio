import { AppShell } from "@/components/shell/app-shell";

// The shell stays put while the session and the invitation are read; the trail, the account and
// the invitation arrive with the page.
export default function Loading() {
  return <AppShell scope="app">{null}</AppShell>;
}
