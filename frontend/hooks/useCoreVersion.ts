"use client";

import { useEffect, useState } from "react";

import { useAppUi } from "@/components/providers/AppProviders";
import { fetchCoreVersion } from "@/lib/coreApi";
import { primaryCoreBaseUrl } from "@/lib/coreBaseUrl";

export type CoreVersionState =
  | { kind: "loading" }
  | { kind: "ok"; version: string }
  | { kind: "error"; message: string };

export function useCoreVersion(): CoreVersionState {
  const { settings } = useAppUi();
  const base = primaryCoreBaseUrl(settings.coreEndpoints);
  const [state, setState] = useState<CoreVersionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!base) {
      setState({ kind: "error", message: "No Core URL" });
      return () => {
        cancelled = true;
      };
    }
    setState({ kind: "loading" });
    fetchCoreVersion(base)
      .then((v) => {
        if (!cancelled) setState({ kind: "ok", version: v.version });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Unreachable",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  return state;
}
