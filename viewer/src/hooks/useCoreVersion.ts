"use client";

import { useCallback, useEffect, useState } from "react";

import { useAppUi } from "@/components/providers/AppProviders";
import { fetchCoreVersion } from "@/lib/coreApi";
import { primaryCoreBaseUrl } from "@/lib/coreBaseUrl";
import { formatClientError } from "@/lib/formatClientError";

export type CoreVersionState =
  | { kind: "loading" }
  | {
      kind: "ok";
      version: string;
      networkEnvironment?: string;
      networkDisplayName?: string;
      genesisOperationsAllowed?: boolean;
      genesisComplete?: boolean;
    }
  | { kind: "error"; message: string };

export function useCoreVersion(): {
  coreVersion: CoreVersionState;
  refetchCoreVersion: () => void;
} {
  const { settings } = useAppUi();
  const base = primaryCoreBaseUrl(settings.coreEndpoints);
  const [state, setState] = useState<CoreVersionState>({ kind: "loading" });
  const [refreshTick, setRefreshTick] = useState(0);

  const refetchCoreVersion = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

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
        if (!cancelled) {
          setState({
            kind: "ok",
            version: v.version,
            networkEnvironment: v.network_environment,
            networkDisplayName: v.network_name,
            genesisOperationsAllowed: v.genesis_operations_allowed,
            genesisComplete: v.genesis_complete,
          });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: formatClientError(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [base, refreshTick]);

  return { coreVersion: state, refetchCoreVersion };
}
