"use client";

import { AppProviders } from "@/components/providers/AppProviders";

import { AppShell } from "./AppShell";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
