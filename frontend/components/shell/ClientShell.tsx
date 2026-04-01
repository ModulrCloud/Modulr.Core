"use client";

import { AppProviders } from "@/components/providers/AppProviders";
import { formatClientError } from "@/lib/formatClientError";

import { AppShell } from "./AppShell";

function _rejectionReasonIsEventLike(r: unknown): boolean {
  if (typeof Event !== "undefined" && r instanceof Event) return true;
  if (typeof r === "object" && r !== null) {
    const tag = Object.prototype.toString.call(r);
    if (tag === "[object Event]" || tag === "[object ErrorEvent]") return true;
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

const REJECTION_FILTER_KEY = "__modulrSuppressEventRejection";

/**
 * Next / webpack sometimes surface DOM `Event` as an unhandled Promise rejection
 * (e.g. chunk/image decode). That becomes a useless dev overlay ("Error: [object Event]").
 *
 * Install once at module load (before useLayoutEffect) so we run before Next's
 * `use-error-handler` listener when possible. `stopImmediatePropagation` keeps other
 * capture-phase listeners on `window` from treating it as a fatal app error.
 */
function _installUnhandledRejectionEventFilter(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, boolean | undefined>;
  if (w[REJECTION_FILTER_KEY]) return;
  w[REJECTION_FILTER_KEY] = true;

  const onRejection = (ev: PromiseRejectionEvent) => {
    const r = ev.reason;
    if (!_rejectionReasonIsEventLike(r)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[modulr-ui] Unhandled rejection (event):",
        formatClientError(r),
      );
    }
  };
  window.addEventListener("unhandledrejection", onRejection, { capture: true });
}

_installUnhandledRejectionEventFilter();

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
