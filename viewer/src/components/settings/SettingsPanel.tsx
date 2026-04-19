import { Link } from "react-router-dom";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import { PreviewBalances } from "@/components/settings/PreviewBalances";
import { useAppUi } from "@/components/providers/AppProviders";
import { ThemeModeSwitch } from "@/components/shell/ThemeModeSwitch";
import {
  ModulrSelect,
  type ModulrSelectOption,
} from "@/components/ui/ModulrSelect";
import {
  PROFILE_IMAGE_FILE_ACCEPT,
  PROFILE_IMAGE_MAX_BYTES,
  isProfileImageMimeAllowedForCore,
  normalizeProfileImageMimeForCore,
  type AppSettings,
  type BackgroundPreset,
} from "@/lib/settings";

const BACKGROUND_PRESET_OPTIONS: ModulrSelectOption[] = [
  { value: "fireflies", label: "Fireflies" },
  { value: "aurora", label: "Aurora glow" },
  { value: "metaballs", label: "Meta balls" },
  { value: "life", label: "Game of Life" },
  { value: "brick", label: "Brick" },
  { value: "gradient", label: "Gradient only" },
];

const SETTINGS_TABS = [
  { id: "general" as const, label: "General" },
  { id: "profile" as const, label: "Profile" },
  { id: "registration" as const, label: "Registration" },
  { id: "resolve" as const, label: "Resolve" },
  { id: "methods" as const, label: "Methods" },
];

function labelCls() {
  return "mb-1 block text-xs font-medium tracking-wide text-[var(--modulr-text-muted)]";
}

function inputCls() {
  return "w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";
}

type SettingsPanelProps = {
  coreOperatorProfileDataUrl?: string | null;
  coreBootstrapDisplayName?: string | null;
};

export function SettingsPanel({
  coreOperatorProfileDataUrl = null,
  coreBootstrapDisplayName = null,
}: SettingsPanelProps) {
  const { settings, setSettings, settingsOpen, setSettingsOpen } = useAppUi();
  const [tab, setTab] = useState<(typeof SETTINGS_TABS)[number]["id"]>("general");
  const [keymasterHint, setKeymasterHint] = useState(false);
  const [profileImageError, setProfileImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, setSettingsOpen]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function addEndpoint() {
    setSettings((s) => ({
      ...s,
      coreEndpoints: [...s.coreEndpoints, "https://127.0.0.1:8000"],
    }));
  }

  function setEndpoint(i: number, url: string) {
    setSettings((s) => {
      const next = [...s.coreEndpoints];
      next[i] = url;
      return { ...s, coreEndpoints: next };
    });
  }

  function removeEndpoint(i: number) {
    setSettings((s) => ({
      ...s,
      coreEndpoints: s.coreEndpoints.filter((_, j) => j !== i),
    }));
  }

  const profileAvatarSrc = coreOperatorProfileDataUrl ?? settings.profileAvatarDataUrl;
  const coreName = coreBootstrapDisplayName?.trim() ?? "";
  const hasCoreBootstrapIdentity = Boolean(coreName);

  function onProfileImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type && !isProfileImageMimeAllowedForCore(file.type)) {
      setProfileImageError("Use PNG, JPEG, WebP, or GIF (same types Core accepts).");
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setProfileImageError(
        `Image must be ${PROFILE_IMAGE_MAX_BYTES / 1024} KB or smaller (resize coming later).`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== "string") return;
      const head = /^data:([^;,]+)/i.exec(data);
      const mime = head ? normalizeProfileImageMimeForCore(head[1]) : "";
      if (!isProfileImageMimeAllowedForCore(mime)) {
        setProfileImageError("Use PNG, JPEG, WebP, or GIF (same types Core accepts).");
        return;
      }
      update("profileAvatarDataUrl", data);
      setProfileImageError(null);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 ${
        settingsOpen ? "" : "pointer-events-none"
      }`}
      aria-hidden={!settingsOpen}
    >
      <button
        type="button"
        tabIndex={settingsOpen ? 0 : -1}
        className={`absolute inset-0 cursor-default bg-black/45 backdrop-blur-md transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          settingsOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close settings"
        onClick={() => setSettingsOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        inert={!settingsOpen}
        className={`modulr-glass-surface relative flex h-[70vh] max-h-[calc(100vh-2rem)] w-[60vw] max-w-[calc(100vw-2rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] shadow-2xl transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          settingsOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
        style={{
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.35), inset 0 1px 0 var(--modulr-glass-highlight)",
        }}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--modulr-glass-border)] px-5 py-4 sm:px-6">
          <h2
            id="settings-dialog-title"
            className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]"
          >
            Settings
          </h2>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--modulr-text-muted)] hover:bg-[var(--modulr-glass-highlight)] hover:text-[var(--modulr-text)]"
            onClick={() => setSettingsOpen(false)}
          >
            Close
          </button>
        </header>

        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--modulr-glass-border)] px-3 pt-2 sm:px-5"
          role="tablist"
          aria-label="Settings sections"
        >
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              id={`settings-tab-${t.id}`}
              className={`shrink-0 rounded-t-lg px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
                tab === t.id
                  ? "bg-[var(--modulr-page-bg)]/40 text-[var(--modulr-accent)] ring-1 ring-[var(--modulr-glass-border)] ring-b-transparent"
                  : "text-[var(--modulr-text-muted)] hover:bg-[var(--modulr-page-bg)]/20 hover:text-[var(--modulr-text)]"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="modulr-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
        >
          {tab === "general" ? (
            <div className="space-y-8">
              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Current profile
                </h3>
                <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
                  Quick access — same identity as the Profile app. Detailed avatar and sign-in
                  options live under the{" "}
                  <span className="font-medium text-[var(--modulr-text)]">Profile</span> tab.
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20">
                  <Link
                    to="/profile"
                    onClick={() => setSettingsOpen(false)}
                    className="group flex items-start gap-4 p-4 transition-colors hover:bg-[var(--modulr-page-bg)]/25"
                  >
                    <div
                      className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-lg font-bold text-[var(--modulr-text-muted)]"
                      aria-hidden
                    >
                      {profileAvatarSrc ? (
                        <img
                          src={profileAvatarSrc}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        "?"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--modulr-text)] group-hover:text-[var(--modulr-accent)]">
                        {hasCoreBootstrapIdentity ? coreName : "Not signed in"}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[var(--modulr-accent)]">
                        Open public profile preview →
                      </p>
                    </div>
                  </Link>
                </div>
              </section>

              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Balances (preview)
                </h3>
                <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
                  Same demonstration figures as the Profile page — not live ledger data.
                </p>
                <PreviewBalances compact />
              </section>

              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Core endpoints
                </h3>
                <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
                  The first URL is used for connectivity checks. Local dev often uses{" "}
                  <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">
                    https://127.0.0.1:8000
                  </code>
                  .
                </p>
                <ul className="space-y-2">
                  {settings.coreEndpoints.map((url, i) => (
                    <li key={i} className="flex gap-2">
                      <input
                        className={inputCls()}
                        value={url}
                        onChange={(e) => setEndpoint(i, e.target.value)}
                        placeholder="https://core.example.com"
                        aria-label={`Core endpoint ${i + 1}`}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-red-500/40 px-2 text-sm text-red-600 hover:bg-red-500/10"
                        onClick={() => removeEndpoint(i)}
                        disabled={settings.coreEndpoints.length <= 1}
                        aria-label="Remove endpoint"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-[var(--modulr-accent)] hover:underline"
                  onClick={addEndpoint}
                >
                  + Add endpoint
                </button>
              </section>

              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Theme
                </h3>
                <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
                  Same as the header — sun/moon next to the gear.
                </p>
                <ThemeModeSwitch variant="compact" />
              </section>

              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Background
                </h3>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.backgroundEnabled}
                    onChange={(e) => update("backgroundEnabled", e.target.checked)}
                    className="size-4 accent-[var(--modulr-accent)]"
                  />
                  <span className="text-sm text-[var(--modulr-text)]">
                    Animated / layered background
                  </span>
                </label>
                <label className={`${labelCls()} mt-3`} htmlFor="bg-preset">
                  Preset
                </label>
                <ModulrSelect
                  id="bg-preset"
                  value={settings.backgroundPreset}
                  onChange={(v) => update("backgroundPreset", v as BackgroundPreset)}
                  options={BACKGROUND_PRESET_OPTIONS}
                />
                <p className="mt-2 text-xs text-[var(--modulr-text-muted)]">
                  <span className="font-medium text-[var(--modulr-text)]">Circuit</span> background
                  — coming soon. Decorative motion follows your OS{" "}
                  <span className="whitespace-nowrap">“reduce motion”</span> setting.
                </p>
              </section>
            </div>
          ) : null}

          {tab === "profile" ? (
            <div className="space-y-6">
              <p className="text-sm text-[var(--modulr-text-muted)]">
                Settings for the <strong className="text-[var(--modulr-text)]">Profile</strong>{" "}
                experience — public preview, avatar, and future wallet / Keymaster flows.
              </p>
              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Profile picture &amp; identity
                </h3>
                <p className="mb-4 text-xs text-[var(--modulr-text-muted)]">
                  After genesis completes, your profile image is stored in Core and shown from{" "}
                  <span className="font-mono text-[10px]">GET /genesis/branding</span>. Local uploads
                  apply in-browser until a signed profile-update flow exists.
                </p>
                <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 px-4 pb-4 pt-3">
                  <label className={labelCls()} htmlFor="profile-avatar-settings">
                    Profile picture (local)
                  </label>
                  <input
                    id="profile-avatar-settings"
                    type="file"
                    accept={PROFILE_IMAGE_FILE_ACCEPT}
                    className="block w-full text-xs text-[var(--modulr-text-muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--modulr-glass-border)] file:bg-[var(--modulr-glass-fill)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--modulr-text)]"
                    onChange={onProfileImageChange}
                  />
                  {profileImageError ? (
                    <p className="mt-1 text-xs font-medium text-red-400/90" role="alert">
                      {profileImageError}
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-[var(--modulr-text-muted)]">
                      PNG, JPEG, WebP, or GIF. Max {PROFILE_IMAGE_MAX_BYTES / 1024} KB.
                    </p>
                  )}
                  {settings.profileAvatarDataUrl ? (
                    <button
                      type="button"
                      onClick={() => update("profileAvatarDataUrl", "")}
                      className="mt-2 text-xs font-medium text-[var(--modulr-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--modulr-text)]"
                    >
                      Remove picture
                    </button>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setKeymasterHint(true)}
                      className="rounded-lg border border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--modulr-accent)] transition-colors hover:bg-[var(--modulr-accent)]/20"
                    >
                      Continue with Keymaster
                    </button>
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1.5 text-xs font-medium text-[var(--modulr-text-muted)]"
                      title="Coming soon"
                    >
                      Modulr Wallet
                    </button>
                  </div>
                  {keymasterHint ? (
                    <p className="mt-2 text-xs leading-snug text-emerald-400/95">
                      Next: same challenge flow as genesis — prove your Ed25519 key, then a browser
                      session (see docs). For now this is a placeholder.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {tab === "registration" ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--modulr-text-muted)]">
                Settings for the <strong className="text-[var(--modulr-text)]">Registration</strong>{" "}
                flow — names, orgs, and pricing previews. App-specific options will land here (e.g.
                default tiers, mock anchors) as we wire the shell to Core.
              </p>
              <div className="rounded-xl border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 px-4 py-6 text-center">
                <p className="text-sm font-medium text-[var(--modulr-text)]">
                  No registration-specific toggles yet
                </p>
                <p className="modulr-text-muted mt-2 text-xs leading-relaxed">
                  When registration gains configurable defaults, they will appear in this tab so you
                  can tune the experience without touching Core policy.
                </p>
              </div>
            </div>
          ) : null}

          {tab === "resolve" ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--modulr-text-muted)]">
                Settings for <strong className="text-[var(--modulr-text)]">Resolve</strong> — name
                lookups, reverse resolution, and explorer-style defaults.
              </p>
              <div className="rounded-xl border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 px-4 py-6 text-center">
                <p className="text-sm font-medium text-[var(--modulr-text)]">
                  No resolver-specific toggles yet
                </p>
                <p className="modulr-text-muted mt-2 text-xs leading-relaxed">
                  Future: preferred record types, TTL hints for mock UI, and which networks appear
                  in the summary — all scoped to this app.
                </p>
              </div>
            </div>
          ) : null}

          {tab === "methods" ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--modulr-text-muted)]">
                Developer settings for the <strong className="text-[var(--modulr-text)]">Methods</strong>{" "}
                playground — signed <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">POST /message</code>{" "}
                against Core.
              </p>
              <section>
                <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
                  Module signing key (dev)
                </h3>
                <p className="mb-3 text-xs text-[var(--modulr-text-muted)] leading-relaxed">
                  <span className="font-medium text-[var(--modulr-text)]">report_module_state</span>{" "}
                  requires the sender key to match the module’s{" "}
                  <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">signing_public_key</code>{" "}
                  row. Paste the same 64-character hex Ed25519 <strong>seed</strong> you used when
                  registering that{" "}
                  <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">module_id</code>.
                  Stored in this browser only; never ship production secrets here.
                </p>
                <label className={labelCls()} htmlFor="methods-dev-seed">
                  Module Ed25519 seed (hex)
                </label>
                <input
                  id="methods-dev-seed"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputCls()}
                  placeholder="64 lowercase hex characters"
                  value={settings.methodsDevEd25519SeedHex}
                  onChange={(e) => {
                    const v = e.target.value
                      .trim()
                      .toLowerCase()
                      .replace(/^0x/, "")
                      .replace(/[^0-9a-f]/g, "")
                      .slice(0, 64);
                    update("methodsDevEd25519SeedHex", v);
                  }}
                  aria-describedby="methods-dev-seed-hint"
                />
                <p id="methods-dev-seed-hint" className="mt-2 text-xs text-[var(--modulr-text-muted)]">
                  Leave empty to skip live{" "}
                  <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">report_module_state</code>{" "}
                  (Methods will show an error until set). Other live Methods still use a random dev
                  key.
                </p>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
