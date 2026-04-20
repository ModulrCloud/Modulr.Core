import { GlassPanel } from "@/components/shell/GlassPanel";

const MODULR_ASSETS_ORIGIN = "https://assets.modulr.cloud";

/**
 * Wallet / decentralized sessions: point users at Modulr.Assets for protection rules (separate product).
 * SSO sessions skip this — assets tied to keys, not hosted login alone.
 */
export function AssetProtectionSettingsCallout() {
  return (
    <section aria-label="Asset protection">
      <GlassPanel className="p-5 sm:p-6">
        <p className="font-modulr-display text-[10px] font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Decentralized session
        </p>
        <h2 className="font-modulr-display mt-2 text-lg font-bold text-[var(--modulr-text)]">
          Asset protection
        </h2>
        <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
          Wallet sign-in means keys and on-chain assets are in play. Recovery and protection for those
          assets are configured on{" "}
          <span className="font-medium text-[var(--modulr-text)]">Modulr.Assets</span> — not inside
          this Core shell. When the schema is available, we can show whether protection looks enabled
          for your wallet here.
        </p>
        <a
          href={MODULR_ASSETS_ORIGIN}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--modulr-accent)] px-5 text-sm font-bold text-[var(--modulr-accent-contrast)] shadow-[0_8px_28px_rgba(255,183,0,0.2)] transition-opacity hover:opacity-95"
        >
          Asset protection settings
        </a>
        <p className="modulr-text-muted mt-3 text-[11px] leading-relaxed">
          Opens{" "}
          <span className="font-mono text-[var(--modulr-text-muted)]">{MODULR_ASSETS_ORIGIN.replace("https://", "")}</span>{" "}
          in a new tab.
        </p>
      </GlassPanel>
    </section>
  );
}
