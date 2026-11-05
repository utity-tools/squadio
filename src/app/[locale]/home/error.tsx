"use client";

import { AppShell } from "@/components/shell/app-shell";
import { PageError } from "@/components/shell/page-error";

// Inicio that cannot be read keeps the app's frame and offers to try again; the frame is the
// way out.
export default function HomeError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <AppShell scope="app" current="home">
      <PageError error={error} retry={retry} />
    </AppShell>
  );
}
