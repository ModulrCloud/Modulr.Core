"use client";

import { useLayoutEffect } from "react";

import { AppProviders } from "@/components/providers/AppProviders";
import { formatClientError } from "@/lib/formatClientError";

import { AppShell } from "./AppShell";

function _rejectionReasonIsEventLike(r: unknown): boolean {
  if (typeof Event !== "undefined" && r instanceof Event) return true;
  if (typeof r === "object" && r !== null) {
    const o = r as { type?: unknown; target?: unknown; isTrusted?: unknown };
    if (
      typeof o.type === "string" &&
      ("target" in o || "isTrusted" in o || "currentTarget" in o)
    ) {
      return true;
    }
  }
  if (typeof r === "string" && r === "[object Event]") return true;
  try {
    return String(r) === "[object Event]";
  } catch {
    return false;
  }
}

/**
 * Next / webpack sometimes surface DOM `Event` as an unhandled Promise rejection
 * (e.g. image decode paths). That produces a useless dev overlay ("[object Event]").
 * Register in capture phase + useLayoutEffect so we run as early as possible vs
 * bubble-phase listeners. Still only suppresses event-shaped reasons.
 */
function useSuppressEventShapedUnhandledRejections(): void {
  useLayoutEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const r = ev.reason;
      if (!_rejectionReasonIsEventLike(r)) return;
      ev.preventDefault();
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[modulr-ui] Unhandled rejection (event):",
          formatClientError(r),
        );
      }
    };
    window.addEventListener("unhandledrejection", onRejection, { capture: true });
    return () =>
      window.removeEventListener("unhandledrejection", onRejection, {
        capture: true,
      });
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
