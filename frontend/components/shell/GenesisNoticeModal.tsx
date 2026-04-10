"use client";

/** Total wizard steps (intro + challenge + verify + complete). Adjust when wiring real steps. */
export const GENESIS_WIZARD_STEP_COUNT = 4;

function formatNetworkEnv(env: string | undefined): string {
  if (!env) return "Unknown";
  const m: Record<string, string> = {
    local: "Local",
    testnet: "Testnet",
    production: "Production",
  };
  return m[env] ?? env;
}

/**
 * Single network line for the header — avoids "Modulr (local) (local)" when Core
 * already embeds the tier in `network_name`.
 */
function formatNetworkHeaderLine(
  networkEnvironment: string | undefined,
  networkDisplayName: string | undefined,
): string {
  const env = networkEnvironment?.trim();
  const display = networkDisplayName?.trim();
  if (!env && !display) return "Unknown";
  if (!env) return display ?? "Unknown";
  if (!display) return formatNetworkEnv(env);

  const d = display.toLowerCase();
  const e = env.toLowerCase();
  const envInParens = `(${e})`;
  const alreadyHasTier =
    d.includes(envInParens) ||
    d === e ||
    d === formatNetworkEnv(networkEnvironment).toLowerCase();

  if (alreadyHasTier) return display;
  return `${display} (${env})`;
}

type Props = {
  open: boolean;
  onDismiss: () => void;
  /** From Core `GET /version` (`network_environment`, `network_name`). */
  networkEnvironment?: string;
  networkDisplayName?: string;
};

/** Simple notice when Core reports `genesis_complete: false` (lab / first boot). */
export function GenesisNoticeModal({
  open,
  onDismiss,
  networkEnvironment,
  networkDisplayName,
}: Props) {
  if (!open) return null;

  const networkLine = formatNetworkHeaderLine(networkEnvironment, networkDisplayName);

  /** Placeholder until step state is wired (challenge → verify → complete). */
  const currentStep = 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="genesis-notice-title"
      aria-describedby="genesis-wizard-step-label"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Dismiss genesis notice"
        onClick={onDismiss}
      />
      <div
        className="modulr-glass-surface relative z-10 flex w-[80vw] h-[50vh] min-h-0 flex-col rounded-2xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] shadow-2xl"
        style={{
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.25), inset 0 1px 0 var(--modulr-glass-highlight)",
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--modulr-glass-border)] px-6 py-4">
          <div className="min-w-0">
            <h2
              id="genesis-notice-title"
              className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]"
            >
              Genesis
            </h2>
            <p className="mt-1 text-xs leading-snug text-[var(--modulr-text-muted)]">
              Network:{" "}
              <span className="font-semibold text-[var(--modulr-text)]">{networkLine}</span>
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-[var(--modulr-text-muted)] hover:bg-[var(--modulr-glass-highlight)] hover:text-[var(--modulr-text)]"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </header>
        <div className="modulr-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="text-base font-medium leading-relaxed text-[var(--modulr-text)]">
            Welcome to Modulr — this network has not been initialized yet.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--modulr-text-muted)]">
            You are seeing this because <strong className="font-semibold text-[var(--modulr-text)]">genesis</strong>{" "}
            has not run: the Modulr deployment you are connected to still needs its one-time setup.
            That setup registers your network on the chain of trust, creates the{" "}
            <strong className="font-semibold text-[var(--modulr-text)]">first organization</strong>, and
            establishes the{" "}
            <strong className="font-semibold text-[var(--modulr-text)]">first operator</strong> — your
            bootstrap identity on this network until others are invited.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--modulr-text-muted)]">
            The next screens walk you through that registration — keys, verification, and final
            confirmation — so you can bring this network online with confidence.
          </p>
        </div>

        <footer
          className="shrink-0 border-t border-[var(--modulr-glass-border)] px-6 py-4"
          aria-label="Wizard navigation"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <p
                className="text-xs font-semibold tracking-wide text-[var(--modulr-text)]"
                id="genesis-wizard-step-label"
              >
                Step {currentStep} of {GENESIS_WIZARD_STEP_COUNT}
              </p>
              <div
                className="flex items-center gap-1.5"
                role="presentation"
                aria-hidden
              >
                {Array.from({ length: GENESIS_WIZARD_STEP_COUNT }, (_, i) => {
                  const n = i + 1;
                  const active = n === currentStep;
                  return (
                    <span
                      key={n}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        active
                          ? "bg-[var(--modulr-accent)] shadow-[0_0_8px_var(--modulr-accent)]"
                          : "bg-[var(--modulr-glass-border)] opacity-70"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                disabled
                className="rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--modulr-text-muted)] opacity-50 cursor-not-allowed"
                aria-disabled="true"
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/15 px-4 py-2 text-sm font-semibold text-[var(--modulr-accent)] transition-colors hover:bg-[var(--modulr-accent)]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
              >
                Next
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
