"use client";

import { AppShell } from "@/components/shell/app-shell";
import { PageError } from "@/components/shell/page-error";

// A scenario that cannot be read (the database is down, a stored row is invalid): never a silent
// or partial result. The frame stays; the way out is the start page, which the demo's visitors
// can also open.
export default function ScenarioError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <AppShell scope="editor" current="inside-projects">
      <PageError error={error} retry={retry} of="scenario" exit="start" />
    </AppShell>
  );
}
