"use client";

import { AppProviders } from "@/components/providers/AppProviders";
import { installUnhandledRejectionEventFilter } from "@/lib/installUnhandledRejectionEventFilter";

import { AppShell } from "./AppShell";

/** Fallback if instrumentation-client did not run (should be idempotent no-op). */
installUnhandledRejectionEventFilter();

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
