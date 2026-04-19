/**
 * Next dev overlay turns Promise rejections whose reason is a DOM Event into
 * `Error: [object Event]` (use-error-handler). Those often come from image/font
 * decode, HMR, or other browser internals — not app logic.
 *
 * Install as early as possible (e.g. instrumentation-client) with capture so we
 * run before React/Next bubble listeners and can stop propagation.
 */

const REJECTION_FILTER_KEY = "__modulrSuppressEventRejection";

export function rejectionReasonIsEventLike(r: unknown): boolean {
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

/** Idempotent; safe to call from ClientShell as well as instrumentation-client. */
export function installUnhandledRejectionEventFilter(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, boolean | undefined>;
  if (w[REJECTION_FILTER_KEY]) return;
  w[REJECTION_FILTER_KEY] = true;

  const onRejection = (ev: PromiseRejectionEvent) => {
    const r = ev.reason;
    if (!rejectionReasonIsEventLike(r)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    if (import.meta.env.DEV) {
      const detail =
        typeof Event !== "undefined" && r instanceof ErrorEvent && r.error instanceof Error
          ? r.error.message
          : String(r);
      console.warn("[modulr-ui] Suppressed unhandled rejection (non-Error reason):", detail);
    }
  };
  window.addEventListener("unhandledrejection", onRejection, { capture: true });
}
