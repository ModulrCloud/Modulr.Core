/**
 * Turn unknown rejections (including DOM Event / ErrorEvent) into a readable string.
 * Next dev overlay shows "Error: [object Event]" when a Promise rejects with an Event.
 */
function isProbablyDomEvent(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if (typeof Event !== "undefined" && e instanceof Event) return true;
  const o = e as Record<string, unknown>;
  return (
    typeof o.type === "string" &&
    ("target" in o || "isTrusted" in o || "currentTarget" in o)
  );
}

export function formatClientError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    return e.message;
  }
  if (typeof Event !== "undefined" && e instanceof Event) {
    const err = (e as ErrorEvent).error;
    if (err instanceof Error) return err.message;
    return `Browser event (${e.type}). Try a hard refresh or run npm run clean in frontend/.`;
  }
  if (isProbablyDomEvent(e)) {
    const o = e as ErrorEvent;
    if ("error" in o && o.error instanceof Error) return o.error.message;
    const t = (e as { type: string }).type;
    return `Browser event (${t}). Try a hard refresh or run npm run clean in frontend/.`;
  }
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  try {
    return String(e);
  } catch {
    return "Unknown error";
  }
}
