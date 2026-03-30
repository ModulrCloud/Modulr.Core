"use client";

import { useAppUi } from "@/components/providers/AppProviders";
import { ThemeModeSwitch } from "@/components/shell/ThemeModeSwitch";
import {
  ModulrSelect,
  type ModulrSelectOption,
} from "@/components/ui/ModulrSelect";
import type { AppSettings, BackgroundPreset, MotionMode } from "@/lib/settings";

const BACKGROUND_PRESET_OPTIONS: ModulrSelectOption[] = [
  { value: "fireflies", label: "Fireflies" },
  { value: "aurora", label: "Aurora glow" },
  { value: "metaballs", label: "Meta balls" },
  { value: "life", label: "Game of Life" },
  { value: "brick", label: "Brick" },
  { value: "gradient", label: "Gradient only" },
];

const MOTION_MODE_OPTIONS: ModulrSelectOption[] = [
  { value: "system", label: "Match system setting" },
  { value: "full", label: "Always animate backgrounds" },
  { value: "reduced", label: "Reduce motion (static)" },
];

function labelCls() {
  return "mb-1 block text-xs font-medium tracking-wide text-[var(--modulr-text-muted)]";
}

function inputCls() {
  return "w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";
}

export function SettingsPanel() {
  const { settings, setSettings, settingsOpen, setSettingsOpen } = useAppUi();

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

  function moveEndpoint(i: number, dir: -1 | 1) {
    setSettings((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.coreEndpoints.length) return s;
      const next = [...s.coreEndpoints];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, coreEndpoints: next };
    });
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

        <div className="flex-1 space-y-8 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Profile
            </h3>
            <p className="mb-4 text-xs text-[var(--modulr-text-muted)]">
              Sign-in is not wired yet. This panel will hold your account when Core
              supports Google OAuth or Modulr Wallet.
            </p>
            <div className="flex items-start gap-4 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-lg font-bold text-[var(--modulr-text-muted)]"
                aria-hidden
              >
                ?
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--modulr-text)]">
                  Not signed in
                </p>
                <p className="modulr-text-muted mt-1 text-xs leading-relaxed">
                  After login, your display name, wallet address or email (masked), and
                  session controls will appear here.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1.5 text-xs font-medium text-[var(--modulr-text-muted)]"
                    title="Coming soon"
                  >
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--modulr-accent)]"
                    title="Coming soon"
                  >
                    Modulr Wallet
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Core endpoints
            </h3>
            <p className="mb-3 text-xs text-[var(--modulr-text-muted)]">
              Order is priority for future requests. Local dev often uses{" "}
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
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      className="rounded border border-[var(--modulr-glass-border)] px-2 py-0.5 text-xs text-[var(--modulr-text)] hover:bg-[var(--modulr-glass-highlight)] disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveEndpoint(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[var(--modulr-glass-border)] px-2 py-0.5 text-xs text-[var(--modulr-text)] hover:bg-[var(--modulr-glass-highlight)] disabled:opacity-30"
                      disabled={i === settings.coreEndpoints.length - 1}
                      onClick={() => moveEndpoint(i, 1)}
                    >
                      ↓
                    </button>
                  </div>
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
              background — coming soon.
            </p>
          </section>

          <section>
            <h3 className="font-modulr-display mb-3 text-sm font-bold text-[var(--modulr-accent)]">
              Motion
            </h3>
            <label className={`${labelCls()}`} htmlFor="motion-mode">
              Respect system reduced motion, or override
            </label>
            <ModulrSelect
              id="motion-mode"
              value={settings.motionMode}
              onChange={(v) => update("motionMode", v as MotionMode)}
              options={MOTION_MODE_OPTIONS}
            />
          </section>
        </div>
      </aside>
    </div>
  );
}
