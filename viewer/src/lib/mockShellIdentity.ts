/** Local-only mock identity for shell UX (handle + org) until sign-in exists. */

export const MOCK_IDENTITY_CHANGED_EVENT = "modulr-mock-identity";

const KEY_HANDLE = "modulr.viewer.mockNetworkHandle";
const KEY_ORG = "modulr.viewer.mockOrganizationKey";
/** Mock “wallet / session connected” until real Keymaster or browser wallet lands. */
const KEY_SHELL_SIGNED_IN = "modulr.viewer.shellSignedIn";
const KEY_PROFILE_AVATAR = "modulr.viewer.mockProfileAvatarDataUrl";
const KEY_PROFILE_BIO = "modulr.viewer.mockProfileBio";
/** `wallet` = decentralized / keys path; `sso` = Google etc. — drives which follow-ups we show in the shell. */
const KEY_SHELL_AUTH_KIND = "modulr.viewer.mockShellAuthKind";

/** Mock sign-in channel until real wallet vs OAuth is wired. */
export type MockShellAuthKind = "wallet" | "sso";

export function getMockNetworkHandle(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY_HANDLE)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setMockNetworkHandle(handle: string): void {
  try {
    window.localStorage.setItem(KEY_HANDLE, handle.trim());
  } catch {
    /* ignore quota */
  }
}

export function clearMockNetworkHandle(): void {
  try {
    window.localStorage.removeItem(KEY_HANDLE);
    window.localStorage.removeItem(KEY_PROFILE_AVATAR);
    window.localStorage.removeItem(KEY_PROFILE_BIO);
    /* Legacy keys from removed Modulr-only mock fields — keep clearing for a clean slate. */
    window.localStorage.removeItem("modulr.viewer.mockModulrPrivatePhone");
    window.localStorage.removeItem("modulr.viewer.mockModulrPrivateDetails");
  } catch {
    /* ignore */
  }
}

export function getMockProfileAvatarDataUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY_PROFILE_AVATAR)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

/** Persists a data URL or clears when empty. */
export function setMockProfileAvatarDataUrl(dataUrl: string): void {
  try {
    if (dataUrl.trim()) {
      window.localStorage.setItem(KEY_PROFILE_AVATAR, dataUrl);
    } else {
      window.localStorage.removeItem(KEY_PROFILE_AVATAR);
    }
  } catch {
    /* ignore quota */
  }
}

export function getMockProfileBio(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY_PROFILE_BIO);
    if (v == null || !v.trim()) return null;
    return v;
  } catch {
    return null;
  }
}

export function setMockProfileBio(text: string): void {
  try {
    const t = text.trim();
    if (t) {
      window.localStorage.setItem(KEY_PROFILE_BIO, t);
    } else {
      window.localStorage.removeItem(KEY_PROFILE_BIO);
    }
  } catch {
    /* ignore */
  }
}

export function getMockOrganizationKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY_ORG)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setMockOrganizationKey(orgKey: string): void {
  try {
    window.localStorage.setItem(KEY_ORG, orgKey.trim());
  } catch {
    /* ignore */
  }
}

export function clearMockOrganizationKey(): void {
  try {
    window.localStorage.removeItem(KEY_ORG);
  } catch {
    /* ignore */
  }
}

export function getMockShellAuthKind(): MockShellAuthKind {
  if (typeof window === "undefined") return "wallet";
  try {
    const v = window.localStorage.getItem(KEY_SHELL_AUTH_KIND);
    return v === "sso" ? "sso" : "wallet";
  } catch {
    return "wallet";
  }
}

export function setMockShellAuthKind(kind: MockShellAuthKind): void {
  try {
    window.localStorage.setItem(KEY_SHELL_AUTH_KIND, kind);
  } catch {
    /* ignore */
  }
  notifyMockIdentityChanged();
}

/** Fire after mock handle/org changes so other shell panels can resync (same-tab). */
export function notifyMockIdentityChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MOCK_IDENTITY_CHANGED_EVENT));
}

export function getShellSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_SHELL_SIGNED_IN) === "1";
  } catch {
    return false;
  }
}

export function setShellSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) {
      window.localStorage.setItem(KEY_SHELL_SIGNED_IN, "1");
    } else {
      window.localStorage.removeItem(KEY_SHELL_SIGNED_IN);
      window.localStorage.removeItem(KEY_SHELL_AUTH_KIND);
    }
  } catch {
    /* ignore */
  }
  notifyMockIdentityChanged();
}
