import { useEffect, useState } from "react";

import {
  getMockShellAuthKind,
  MOCK_IDENTITY_CHANGED_EVENT,
  type MockShellAuthKind,
} from "@/lib/mockShellIdentity";

/** Tracks mock wallet vs SSO sign-in for shell UX (e.g. Modulr.Assets callouts). */
export function useMockShellAuthKind(): MockShellAuthKind {
  const [kind, setKind] = useState<MockShellAuthKind>(() => getMockShellAuthKind());

  useEffect(() => {
    function sync() {
      setKind(getMockShellAuthKind());
    }
    sync();
    window.addEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
  }, []);

  return kind;
}
