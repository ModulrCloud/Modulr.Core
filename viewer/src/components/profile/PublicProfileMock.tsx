"use client";

import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/shell/GlassPanel";
import { PreviewBalances } from "@/components/settings/PreviewBalances";
import { useAppUi } from "@/components/providers/AppProviders";
import { useCoreVersion } from "@/hooks/useCoreVersion";
import { useMockShellAuthKind } from "@/hooks/useMockShellAuthKind";
import { useShellSignedIn } from "@/hooks/useShellSignedIn";
import { useGenesisBranding } from "@/hooks/useGenesisBranding";
import { SignInRequiredScreen } from "@/components/shell/SignInRequiredScreen";
import { primaryCoreBaseUrl } from "@/lib/coreBaseUrl";
import {
  getMockNetworkHandle,
  getMockProfileAvatarDataUrl,
  MOCK_IDENTITY_CHANGED_EVENT,
} from "@/lib/mockShellIdentity";

import { AssetProtectionSettingsCallout } from "./AssetProtectionSettingsCallout";
import { ProfileHandleClaim } from "./ProfileHandleClaim";
import { ProfileHeroEdit } from "./ProfileHeroEdit";

/**
 * Full-page preview of a future Modulr.Web-style public profile: balances, orgs,
 * and shareable assets. Private / encrypted items are never listed here by design.
 */
export function PublicProfileMock() {
  const shellSignedIn = useShellSignedIn();
  const shellAuthKind = useMockShellAuthKind();
  const { settings } = useAppUi();
  const { coreVersion } = useCoreVersion();
  const coreBase = primaryCoreBaseUrl(settings.coreEndpoints);
  const genesisOk =
    coreVersion.kind === "ok" && coreVersion.genesisComplete === true;
  const { branding } = useGenesisBranding(coreBase, genesisOk);

  const [mockHandle, setMockHandle] = useState<string | null>(null);
  const [mockProfileAvatar, setMockProfileAvatar] = useState<string | null>(null);
  useEffect(() => {
    function sync() {
      setMockHandle(getMockNetworkHandle());
      setMockProfileAvatar(getMockProfileAvatarDataUrl());
    }
    sync();
    window.addEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
  }, []);

  const profileAvatarSrc =
    mockProfileAvatar ??
    (branding.kind === "ok"
      ? branding.operatorProfileDataUrl ?? settings.profileAvatarDataUrl
      : settings.profileAvatarDataUrl);
  const displayName =
    branding.kind === "ok" && branding.raw.bootstrap_operator_display_name?.trim()
      ? branding.raw.bootstrap_operator_display_name.trim()
      : "Preview operator";
  const rootOrg =
    branding.kind === "ok" ? branding.raw.root_organization_label?.trim() : null;

  const handleLine = mockHandle ? `@${mockHandle}` : "@preview.operator";

  if (!shellSignedIn) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        description="Profile and identity tools need a connected session (wallet or Keymaster in production). Use the demo control on the home page, or connect below."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-16">
      <div>
        <p className="font-modulr-display text-xs font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Public profile
        </p>
        <h1 className="font-modulr-display mt-2 text-3xl font-bold tracking-tight text-[var(--modulr-text)] sm:text-4xl">
          {displayName}
        </h1>
        <p className="modulr-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
          Preview only — same layout we plan to use on Modulr.Web for handles and org pages. Only
          what you choose to show publicly appears here; encrypted vault content never does.
        </p>
      </div>

      <ProfileHandleClaim />

      <GlassPanel className="overflow-hidden p-0 sm:p-0">
        {mockHandle ? (
          <ProfileHeroEdit
            profileAvatarSrc={profileAvatarSrc}
            hasMockAvatarOverride={Boolean(mockProfileAvatar)}
            displayName={displayName}
            handleLine={handleLine}
            rootOrg={rootOrg}
          />
        ) : (
          <div className="relative border-b border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/30 px-6 py-10 sm:px-10">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
              <div
                className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[var(--modulr-accent)]/35 bg-[var(--modulr-glass-fill)] text-3xl font-bold text-[var(--modulr-text-muted)] shadow-lg sm:size-32"
                aria-hidden
              >
                {profileAvatarSrc ? (
                  <img src={profileAvatarSrc} alt="" className="size-full object-cover" />
                ) : (
                  "?"
                )}
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="font-modulr-display text-2xl font-bold text-[var(--modulr-text)]">
                  {displayName}
                </p>
                <p className="mt-1 font-mono text-sm text-[var(--modulr-text-muted)]">{handleLine}</p>
                <p className="modulr-text-muted mt-4 max-w-xl text-sm leading-relaxed">
                  Claim a handle above to set your <span className="font-mono">@name</span>, photo, and
                  bio in one place.
                </p>
                {rootOrg ? (
                  <p className="mt-3 text-xs text-[var(--modulr-text-muted)]">
                    Root org context from Core:{" "}
                    <span className="font-mono text-[var(--modulr-text)]">{rootOrg}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </GlassPanel>

      {shellSignedIn && shellAuthKind === "wallet" ? <AssetProtectionSettingsCallout /> : null}

      <PreviewBalances />

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
