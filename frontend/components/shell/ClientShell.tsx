"use client";

import { useEffect } from "react";

import { AppProviders } from "@/components/providers/AppProviders";
import { formatClientError } from "@/lib/formatClientError";

import { AppShell } from "./AppShell";

/**
 * Next / webpack sometimes surface DOM `Event` as an unhandled Promise rejection
 * (e.g. image decode paths). That produces a useless dev overlay ("[object Event]").
 * We preventDefault only for event-shaped reasons so real Error rejections still surface.
 */
function useSuppressEventShapedUnhandledRejections(): void {
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const r = ev.reason;
      const eventLike =
        (typeof Event !== "undefined" && r instanceof Event) ||
        (typeof r === "object" &&
          r !== null &&
          typeof (r as { type?: unknown }).type === "string" &&
          ("target" in r || "isTrusted" in r || "currentTarget" in r));
      if (!eventLike) return;
      ev.preventDefault();
      if (process.env.NODE_ENV === "development") {
        console.warn("[modulr-ui] Unhandled rejection (event):", formatClientError(r));
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  useSuppressEventShapedUnhandledRejections();
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
