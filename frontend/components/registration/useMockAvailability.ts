"use client";

import { useEffect, useRef, useState } from "react";

import { mockCheckRegistrationKeyAvailable } from "./mockAvailability";
import { useDebounced } from "./useDebounced";

export type MockAvailStatus =
  | "idle_invalid"
  | "pending"
  | "checking"
  | "available"
  | "taken";

/**
 * After `valid` input stabilizes for `debounceMs`, runs a mock Core lookup.
 * Stale responses are dropped if the user keeps typing.
 */
export function useMockAvailability(
  normalized: string,
  valid: boolean,
  kind: "name" | "org",
  debounceMs: number,
): MockAvailStatus {
  const debounced = useDebounced(normalized, debounceMs);
  const [status, setStatus] = useState<MockAvailStatus>("idle_invalid");
  const normRef = useRef(normalized);
  const debRef = useRef(debounced);
  normRef.current = normalized;
  debRef.current = debounced;

  useEffect(() => {
    if (!valid) {
      setStatus("idle_invalid");
      return;
    }
    if (normalized !== debounced) {
      setStatus("pending");
      return;
    }
    const key = debounced;
    let cancelled = false;
    setStatus("checking");
    void mockCheckRegistrationKeyAvailable(kind, key)
      .then((ok) => {
        if (cancelled) return;
        if (normRef.current !== key || debRef.current !== key) return;
        setStatus(ok ? "available" : "taken");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("taken");
      });
    return () => {
      cancelled = true;
    };
  }, [valid, normalized, debounced, kind]);

  return status;
}
