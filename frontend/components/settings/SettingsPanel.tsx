"use client";

import Link from "next/link";
import type { ChangeEvent } from "react";
import { useState } from "react";

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

function labelCls() {
  return "mb-1 block text-xs font-medium tracking-wide text-[var(--modulr-text-muted)]";
}

function inputCls() {
  return "w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";
}

type SettingsPanelProps = {
  /** When genesis finished and Core persisted a profile image, prefer this over local-only data. */
  coreOperatorProfileDataUrl?: string | null;
  /** From `GET /genesis/branding` after genesis — not a session login, but Core-held identity. */
  coreBootstrapDisplayName?: string | null;
};

export function SettingsPanel({
  coreOperatorProfileDataUrl = null,
  coreBootstrapDisplayName = null,
}: SettingsPanelProps) {
  const { settings, setSettings, settingsOpen, setSettingsOpen } = useAppUi();
  const [keymasterHint, setKeymasterHint] = useState(false);
  const [profileImageError, setProfileImageError] = useState<string | null>(null);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function addEndpoint() {
    setSettings((s) => ({
      ...s,
      coreEndpoints: [...s.coreEndpoints, "http://127.0.0.1:8000"],
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
      className={`fixed inset-0 z-50 flex justify-end ${settingsOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!settingsOpen}
    >
      <button
        type="button"
        tabIndex={settingsOpen ? 0 : -1}
        className={`h-full flex-1 cursor-default backdrop-blur-sm transition-[opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          settingsOpen ? "bg-black/40 opacity-100" : "bg-black/40 opacity-0"
        }`}
        aria-label="Close settings"
        onClick={() => setSettingsOpen(false)}
      />
      <aside
        inert={!settingsOpen}
        className={`modulr-glass-surface flex h-full w-full max-w-md flex-col border-l border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] shadow-2xl transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          settingsOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          boxShadow:
            "-12px 0 48px rgba(0,0,0,0.2), inset 1px 0 0 var(--modulr-glass-highlight)",
        }}
      >
        <header className="flex items-center justify-between border-b border-[var(--modulr-glass-border)] px-5 py-4">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
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

        <div className="modulr-scrollbar flex-1 space-y-8 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Profile
            </h3>
            <p className="mb-4 text-xs text-[var(--modulr-text-muted)]">
              After genesis completes, your profile image is stored in Core and shown here from{" "}
              <span className="font-mono text-[10px]">GET /genesis/branding</span>. Local uploads
              still apply in-browser until a signed profile-update flow exists.
            </p>
            <div className="overflow-hidden rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20">
              <Link
                href="/profile"
                onClick={() => setSettingsOpen(false)}
                className="group flex items-start gap-4 p-4 transition-colors hover:bg-[var(--modulr-page-bg)]/25"
              >
                <div
                  className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-lg font-bold text-[var(--modulr-text-muted)]"
                  aria-hidden
                >
                  {profileAvatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL from user file
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
                  <p className="modulr-text-muted mt-1 text-xs leading-relaxed">
                    {hasCoreBootstrapIdentity ? (
                      <>
                        Bootstrap operator display name and profile image are read from Core (
                        <span className="font-mono text-[10px]">GET /genesis/branding</span>). This
                        is not a Keymaster or wallet session — those come later.
                      </>
                    ) : (
                      <>
                        After Keymaster sign-in, your display name and session will appear here.
                        Core will know your operator identity once genesis is complete and session
                        wiring lands.
                      </>
                    )}
                  </p>
                </div>
              </Link>
              <div className="border-t border-[var(--modulr-glass-border)] px-4 pb-4 pt-3">
                <label className={labelCls()} htmlFor="profile-avatar">
                  Profile picture (local)
                </label>
                <input
                  id="profile-avatar"
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                    Next: same challenge flow as genesis — prove your Ed25519 key, then a
                    browser session (see docs). For now this is a placeholder.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Balances (preview)
            </h3>
            <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
              MDR tokens and MTR credits will appear here when the network economics API is
              connected. Not live yet.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
                  MDR tokens
                </p>
                <p className="font-modulr-display mt-1 text-lg font-bold tabular-nums text-[var(--modulr-text)]">
                  —
                </p>
              </div>
              <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
                  MTR credits
                </p>
                <p className="font-modulr-display mt-1 text-lg font-bold tabular-nums text-[var(--modulr-text)]">
                  —
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Core endpoints
            </h3>
            <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
              The first URL is used for connectivity checks (stage 2+). Local dev
              often uses{" "}
              <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">
                http://127.0.0.1:8000
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
              Methods (dev)
            </h3>
            <p className="mb-3 text-xs text-[var(--modulr-text-muted)] leading-relaxed">
              <span className="font-medium text-[var(--modulr-text)]">report_module_state</span>{" "}
              requires the sender key to match the module’s{" "}
              <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">signing_public_key</code>{" "}
              row. Paste the same 64-character hex Ed25519 <strong>seed</strong> you used when
              registering that <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">module_id</code>
              . Stored in this browser only; never ship production secrets here.
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
              Leave empty to skip live <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">report_module_state</code>{" "}
              (Methods will show an error until set). Other live Methods still use a random dev key.
            </p>
          </section>

          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Theme
            </h3>
            <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
              Same as the header — sun/moon button next to the gear.
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
                onChange={(e) =>
                  update("backgroundEnabled", e.target.checked)
                }
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
              onChange={(v) =>
                update("backgroundPreset", v as BackgroundPreset)
              }
              options={BACKGROUND_PRESET_OPTIONS}
            />
            <p className="mt-2 text-xs text-[var(--modulr-text-muted)]">
              <span className="font-medium text-[var(--modulr-text)]">
                Circuit
              </span>{" "}
              background — coming soon. Decorative motion follows your OS{" "}
              <span className="whitespace-nowrap">“reduce motion”</span> setting.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
