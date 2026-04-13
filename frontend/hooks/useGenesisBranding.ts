"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchGenesisBranding, type GenesisBrandingJson } from "@/lib/coreApi";
import { formatClientError } from "@/lib/formatClientError";

export type GenesisBrandingState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      raw: GenesisBrandingJson;
      /** Ready for `<img src={...} />` when Core persisted a profile image. */
      operatorProfileDataUrl: string | null;
    };

/** Build a data URL Core can round-trip via GET /genesis/branding. */
export function operatorProfileDataUrlFromBranding(b: GenesisBrandingJson): string | null {
  const mime = b.operator_profile_image_mime?.trim();
  const b64 = b.operator_profile_image_base64?.trim();
  if (!mime || !b64) return null;
  return `data:${mime};base64,${b64}`;
}

export function useGenesisBranding(
  coreBaseUrl: string | null | undefined,
  enabled: boolean,
): { branding: GenesisBrandingState; refetchGenesisBranding: () => void } {
  const [state, setState] = useState<GenesisBrandingState>({ kind: "idle" });
  const [tick, setTick] = useState(0);

  const refetchGenesisBranding = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !coreBaseUrl?.trim()) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    fetchGenesisBranding(coreBaseUrl.trim())
      .then((raw) => {
        if (cancelled) return;
        setState({
          kind: "ok",
          raw,
          operatorProfileDataUrl: operatorProfileDataUrlFromBranding(raw),
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: formatClientError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [coreBaseUrl, enabled, tick]);

  return { branding: state, refetchGenesisBranding };
}
