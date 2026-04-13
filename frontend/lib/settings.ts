/** Local persistence for customer UI (stage 1). */

export type BackgroundPreset =
  | "fireflies"
  | "aurora"
  | "metaballs"
  | "life"
  | "brick"
  | "gradient";

export type ColorMode = "dark" | "light";

export type AppSettings = {
  coreEndpoints: string[];
  /** Default **dark** (first / primary in the UI). */
  colorMode: ColorMode;
  backgroundEnabled: boolean;
  backgroundPreset: BackgroundPreset;
  /**
   * Optional 64-char hex Ed25519 seed for Methods **report_module_state** live calls.
   * Must match the `module_id` you report for. Dev only; stored in localStorage.
   */
  methodsDevEd25519SeedHex: string;
  /**
   * Optional profile image (data URL) for the shell Settings profile — **browser only** until Core
   * exposes upload. Large strings are capped in `normalizeSettings`.
   */
  profileAvatarDataUrl: string;
};

export const SETTINGS_STORAGE_KEY = "modulr.customer-ui.settings";

/** Max file size before we store a data URL in localStorage (same cap in Settings + Genesis step 3). */
export const PROFILE_IMAGE_MAX_BYTES = 256 * 1024;

/** Max persisted length for `profileAvatarDataUrl` (~512 KB string budget). */
const PROFILE_AVATAR_DATA_URL_MAX_CHARS = 520_000;

export const DEFAULT_SETTINGS: AppSettings = {
  coreEndpoints: ["http://127.0.0.1:8000"],
  colorMode: "dark",
  backgroundEnabled: true,
  backgroundPreset: "fireflies",
  methodsDevEd25519SeedHex: "",
  profileAvatarDataUrl: "",
};

export function normalizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const endpoints = o.coreEndpoints;
  const coreEndpoints = Array.isArray(endpoints)
    ? endpoints.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [...DEFAULT_SETTINGS.coreEndpoints];

  let colorMode: ColorMode = DEFAULT_SETTINGS.colorMode;
  if (o.colorMode === "dark" || o.colorMode === "light") {
    colorMode = o.colorMode;
  } else if (typeof o.themeMix === "number" && Number.isFinite(o.themeMix)) {
    colorMode = o.themeMix >= 0.5 ? "dark" : "light";
  }

  const backgroundEnabled =
    typeof o.backgroundEnabled === "boolean"
      ? o.backgroundEnabled
      : DEFAULT_SETTINGS.backgroundEnabled;
  const preset = o.backgroundPreset;
  let backgroundPreset: BackgroundPreset = DEFAULT_SETTINGS.backgroundPreset;
  if (preset === "none") {
    backgroundPreset = "gradient";
  } else if (preset === "breakout") {
    backgroundPreset = "brick";
  } else if (
    preset === "fireflies" ||
    preset === "aurora" ||
    preset === "metaballs" ||
    preset === "life" ||
    preset === "brick" ||
    preset === "gradient"
  ) {
    backgroundPreset = preset;
  }

  let methodsDevEd25519SeedHex = DEFAULT_SETTINGS.methodsDevEd25519SeedHex;
  const seedRaw = o.methodsDevEd25519SeedHex;
  if (typeof seedRaw === "string") {
    const t = seedRaw
      .trim()
      .toLowerCase()
      .replace(/^0x/, "")
      .replace(/[^0-9a-f]/g, "")
      .slice(0, 64);
    methodsDevEd25519SeedHex = t;
  }

  let profileAvatarDataUrl = DEFAULT_SETTINGS.profileAvatarDataUrl;
  const avatarRaw = o.profileAvatarDataUrl;
  if (typeof avatarRaw === "string" && avatarRaw.startsWith("data:") && avatarRaw.length <= PROFILE_AVATAR_DATA_URL_MAX_CHARS) {
    profileAvatarDataUrl = avatarRaw;
  }

  return {
    coreEndpoints: coreEndpoints.length ? coreEndpoints : [...DEFAULT_SETTINGS.coreEndpoints],
    colorMode,
    backgroundEnabled,
    backgroundPreset,
    methodsDevEd25519SeedHex,
    profileAvatarDataUrl,
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}
