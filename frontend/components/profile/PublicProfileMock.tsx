"use client";

import Link from "next/link";

import { CountUpNumber } from "@/components/dashboard/CountUpNumber";
import { GlassPanel } from "@/components/shell/GlassPanel";
import { useAppUi } from "@/components/providers/AppProviders";
import { useCoreVersion } from "@/hooks/useCoreVersion";
import { useGenesisBranding } from "@/hooks/useGenesisBranding";
import { primaryCoreBaseUrl } from "@/lib/coreBaseUrl";

/** Demonstration balances only — not live ledger data. */
const MOCK_MDR = 12_480;
/** Basis for preview: 1 MTR = USD 0.10 (native currency conversion is future work). */
const MOCK_MTR = 342;
const MTR_USD_PER_CREDIT = 0.1;

function formatPreviewUsd(mtrCredits: number) {
  const usd = mtrCredits * MTR_USD_PER_CREDIT;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

/**
 * Full-page preview of a future Modulr.Web-style public profile: balances, orgs,
 * and shareable assets. Private / encrypted items are never listed here by design.
 */
export function PublicProfileMock() {
  const { settings } = useAppUi();
  const { coreVersion } = useCoreVersion();
  const coreBase = primaryCoreBaseUrl(settings.coreEndpoints);
  const genesisOk =
    coreVersion.kind === "ok" && coreVersion.genesisComplete === true;
  const { branding } = useGenesisBranding(coreBase, genesisOk);

  const profileAvatarSrc =
    branding.kind === "ok"
      ? branding.operatorProfileDataUrl ?? settings.profileAvatarDataUrl
      : settings.profileAvatarDataUrl;
  const displayName =
    branding.kind === "ok" && branding.raw.bootstrap_operator_display_name?.trim()
      ? branding.raw.bootstrap_operator_display_name.trim()
      : "Preview operator";
  const rootOrg =
    branding.kind === "ok" ? branding.raw.root_organization_label?.trim() : null;

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-modulr-display text-xs font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
            Public profile
          </p>
          <h1 className="font-modulr-display mt-2 text-3xl font-bold tracking-tight text-[var(--modulr-text)] sm:text-4xl">
            {displayName}
          </h1>
          <p className="modulr-text-muted mt-2 max-w-xl text-sm leading-relaxed">
            Preview only — same layout we plan to use on Modulr.Web for handles and org pages.
            Only what you choose to show publicly appears here; encrypted vault content never does.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-4 py-2 text-sm font-medium text-[var(--modulr-text)] transition-colors hover:border-[var(--modulr-accent)]/40 hover:text-[var(--modulr-accent)]"
        >
          ← Home
        </Link>
      </div>

      <GlassPanel className="overflow-hidden p-0 sm:p-0">
        <div className="relative border-b border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/30 px-6 py-10 sm:px-10">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
            <div
              className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[var(--modulr-accent)]/35 bg-[var(--modulr-glass-fill)] text-3xl font-bold text-[var(--modulr-text-muted)] shadow-lg"
              aria-hidden
            >
              {profileAvatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL
                <img
                  src={profileAvatarSrc}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                "?"
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="font-modulr-display text-2xl font-bold text-[var(--modulr-text)]">
                {displayName}
              </p>
              <p className="mt-1 font-mono text-sm text-[var(--modulr-text-muted)]">
                @preview.operator
              </p>
              {rootOrg ? (
                <p className="mt-2 text-xs text-[var(--modulr-text-muted)]">
                  Root org context from Core:{" "}
                  <span className="font-mono text-[var(--modulr-text)]">{rootOrg}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </GlassPanel>

      <section className="grid gap-4 sm:grid-cols-2">
        <GlassPanel className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-accent)]">
            MDR tokens
          </p>
          <p className="font-modulr-display mt-2 text-3xl font-bold tabular-nums text-[var(--modulr-text)]">
            <CountUpNumber value={MOCK_MDR} />
          </p>
          <p className="modulr-text-muted mt-2 text-xs leading-relaxed">
            Mock balance for this preview. Network economics are not wired in this shell yet.
          </p>
        </GlassPanel>
        <GlassPanel className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-accent)]">
            MTR credits
          </p>
          <p className="font-modulr-display mt-2 text-3xl font-bold tabular-nums text-[var(--modulr-text)]">
            <CountUpNumber value={MOCK_MTR} />
          </p>
          <p className="modulr-text-muted mt-2 text-xs leading-relaxed">
            Planned basis: 1 MTR credit = {formatPreviewUsd(1)} USD (transparent, not obfuscated).
            Later: convert credits to the viewer&apos;s native currency at spot or policy rate. Preview
            equivalent: <span className="font-medium text-[var(--modulr-text)]">{formatPreviewUsd(MOCK_MTR)}</span>{" "}
            at this basis.
          </p>
        </GlassPanel>
      </section>

      <section>
        <h2 className="font-modulr-display mb-4 text-lg font-bold text-[var(--modulr-text)]">
          Organizations
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              title: rootOrg ?? "your-root",
              subtitle: "Root label · landing page (future)",
              hint: "Expensive on mainnet — preview copy only.",
            },
            {
              title: "labs.example",
              subtitle: "Dotted org · module namespace",
              hint: "Same public profile shape as users, different scope.",
            },
          ].map((o) => (
            <GlassPanel key={o.title} className="p-5">
              <p className="font-mono text-sm font-semibold text-[var(--modulr-accent)]">
                {o.title}
              </p>
              <p className="modulr-text-muted mt-1 text-sm">{o.subtitle}</p>
              <p className="modulr-text-muted mt-3 text-xs leading-relaxed">{o.hint}</p>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-modulr-display mb-4 text-lg font-bold text-[var(--modulr-text)]">
          Public digital assets
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["Artifact", "Badge", "Module", "Link-out"].map((label) => (
            <div
              key={label}
              className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 p-3 text-center"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
                {label}
              </span>
              <span className="modulr-text-muted mt-2 text-xs">Mock tile</span>
            </div>
          ))}
        </div>
        <p className="modulr-text-muted mt-4 max-w-2xl text-xs leading-relaxed">
          Think MySpace top‑8 energy, but for modules and assets you explicitly publish. Nothing
          from private storage appears without an intentional share action.
        </p>
      </section>
    </div>
  );
}
