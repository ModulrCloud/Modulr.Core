import { CountUpNumber } from "@/components/dashboard/CountUpNumber";
import { GlassPanel } from "@/components/shell/GlassPanel";
import {
  formatPreviewUsd,
  MOCK_MDR,
  MOCK_MTR,
} from "@/lib/mockBalances";

type PreviewBalancesProps = {
  /** Tighter padding when embedded in settings modal. */
  compact?: boolean;
};

/**
 * Same mock MDR / MTR figures and copy basis as the public profile page.
 */
export function PreviewBalances({ compact = false }: PreviewBalancesProps) {
  const pad = compact ? "px-3 py-3" : "p-5 sm:p-6";
  const titleCls = compact
    ? "text-[10px] font-semibold uppercase tracking-wide text-[var(--modulr-accent)]"
    : "text-xs font-semibold uppercase tracking-wider text-[var(--modulr-accent)]";
  const valueCls = compact
    ? "font-modulr-display mt-1 text-2xl font-bold tabular-nums text-[var(--modulr-text)] sm:text-3xl"
    : "font-modulr-display mt-2 text-3xl font-bold tabular-nums text-[var(--modulr-text)]";

  const mdrCard = (
    <>
      <p className={titleCls}>MDR tokens</p>
      <p className={valueCls}>
        <CountUpNumber value={MOCK_MDR} />
      </p>
      <p className="modulr-text-muted mt-2 text-xs leading-relaxed">
        Mock balance for this preview. Network economics are not wired in this shell yet.
      </p>
    </>
  );
  const mtrCard = (
    <>
      <p className={titleCls}>MTR credits</p>
      <p className={valueCls}>
        <CountUpNumber value={MOCK_MTR} />
      </p>
      <p className="modulr-text-muted mt-2 text-xs leading-relaxed">
        Planned basis: 1 MTR credit = {formatPreviewUsd(1)} USD (transparent, not obfuscated).
        Later: convert credits to the viewer&apos;s native currency at spot or policy rate. Preview
        equivalent:{" "}
        <span className="font-medium text-[var(--modulr-text)]">{formatPreviewUsd(MOCK_MTR)}</span>{" "}
        at this basis.
      </p>
    </>
  );

  if (compact) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 ${pad}`}
        >
          {mdrCard}
        </div>
        <div
          className={`rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 ${pad}`}
        >
          {mtrCard}
        </div>
      </div>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <GlassPanel className="p-5 sm:p-6">{mdrCard}</GlassPanel>
      <GlassPanel className="p-5 sm:p-6">{mtrCard}</GlassPanel>
    </section>
  );
}
