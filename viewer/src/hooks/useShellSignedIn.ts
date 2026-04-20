import { useEffect, useState } from "react";

import {
  getShellSignedIn,
  MOCK_IDENTITY_CHANGED_EVENT,
} from "@/lib/mockShellIdentity";

/** Mock session (wallet / shell connected) for gating Profile & Organizations. */
export function useShellSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(() => getShellSignedIn());

  useEffect(() => {
    function sync() {
      setSignedIn(getShellSignedIn());
    }
    sync();
    window.addEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
  }, []);

  return signedIn;
}
