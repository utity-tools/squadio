"use client";

import { AppShell } from "@/components/shell/app-shell";
import { PageError } from "@/components/shell/page-error";

// A project that cannot be read keeps the app's frame, offers to try again and Inicio.
export default function ProjectError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <AppShell scope="app" current="inside-projects">
      <PageError error={error} retry={retry} exit="home" />
    </AppShell>
  );
}
