"use client";

import { Link } from "react-router-dom";
import { useEffect, useId, useMemo, useState } from "react";

import { GlassPanel } from "@/components/shell/GlassPanel";
import { SignInRequiredScreen } from "@/components/shell/SignInRequiredScreen";
import { useShellSignedIn } from "@/hooks/useShellSignedIn";
import { RegisterFormSection } from "@/components/registration/RegisterFormShared";
import {
  formatMockUsd,
  mockOrgPriceQuote,
  orgNamespaceAnchorUsd,
} from "@/components/registration/mockRegistrationPricing";
import { useMockAvailability } from "@/components/registration/useMockAvailability";
import {
  getMockNetworkHandle,
  getMockOrganizationKey,
  MOCK_IDENTITY_CHANGED_EVENT,
  notifyMockIdentityChanged,
  setMockOrganizationKey,
} from "@/lib/mockShellIdentity";

function MockToggleRow({
  label,
  description,
  defaultOn = true,
}: {
  label: string;
  description: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--modulr-glass-border)] py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-[var(--modulr-text)]">{label}</p>
        <p className="modulr-text-muted mt-1 text-xs leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-[var(--modulr-accent)]" : "bg-[var(--modulr-text-muted)]/35"
        }`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${
            on ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function OrganizationsMock() {
  const shellSignedIn = useShellSignedIn();
  const learnId = useId();
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [mockHandle, setMockHandle] = useState(() => getMockNetworkHandle());
  const [mockOrgKey, setMockOrgKey] = useState(() => getMockOrganizationKey());

  useEffect(() => {
    function sync() {
      setMockHandle(getMockNetworkHandle());
      setMockOrgKey(getMockOrganizationKey());
    }
    sync();
    window.addEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
  }, []);

  const [orgInput, setOrgInput] = useState("");
  const [orgSubmitNote, setOrgSubmitNote] = useState<string | null>(null);
  const [orgMarketDepth, setOrgMarketDepth] = useState(0);

  const orgQuote = useMemo(
    () => mockOrgPriceQuote(orgInput, orgMarketDepth),
    [orgInput, orgMarketDepth],
  );
  const orgAvail = useMockAvailability(orgQuote.normalized, orgQuote.valid, "org", 1000);

  const hasHandle = Boolean(mockHandle);
  const hasOrg = Boolean(mockOrgKey);

  function syncIdentity() {
    setMockHandle(getMockNetworkHandle());
    setMockOrgKey(getMockOrganizationKey());
  }

  if (!shellSignedIn) {
    return (
      <SignInRequiredScreen
        title="Sign in to manage organizations"
        description="Org namespaces, members, and policies are tied to an authenticated session. Connect with the demo control on the home dashboard first."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!hasHandle ? (
        <GlassPanel className="border-amber-500/30 bg-amber-500/[0.07] p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Claim a handle first
          </h2>
          <p className="modulr-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
            Organization management is tied to an identity on the network. In this shell preview,
            set a mock handle on{" "}
            <Link
              to="/profile"
              className="font-semibold text-[var(--modulr-accent)] underline-offset-2 hover:underline"
            >
              Profile
            </Link>{" "}
            before registering or administering an org.
          </p>
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-6 sm:p-8">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Core
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Organizations
        </h1>
        <p className="modulr-text-muted mt-4 max-w-3xl leading-relaxed">
          Namespace and governance for your team: register an org key, invite members, set spend
          limits, and control which network apps roles can use — mock UI only until these flows are
          wired to Core.
        </p>
        {hasHandle ? (
          <p className="modulr-text-muted mt-3 text-sm">
            Acting as{" "}
            <span className="font-mono font-semibold text-[var(--modulr-accent)]">@{mockHandle}</span>
            {" · "}
            <button
              type="button"
              className="font-semibold text-[var(--modulr-accent)] underline-offset-2 hover:underline"
              onClick={() => syncIdentity()}
            >
              Refresh identity
            </button>
          </p>
        ) : null}
        {!learnMoreOpen ? (
          <button
            type="button"
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--modulr-accent)] transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
            aria-expanded={false}
            aria-controls={learnId}
            onClick={() => setLearnMoreOpen(true)}
          >
            <span className="select-none text-[10px]" aria-hidden>
              ▶
            </span>
            Org namespace notes
          </button>
        ) : null}
        <div
          id={learnId}
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${learnMoreOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={`space-y-3 text-sm ${learnMoreOpen ? "border-t border-[var(--modulr-glass-border)] pt-4" : ""}`}
              aria-hidden={!learnMoreOpen}
            >
              <p className="modulr-text-muted max-w-3xl leading-relaxed">
                Org keys use DNS-style labels; a single apex label delegates a whole namespace. Mock
                pricing uses a rising floor for whole-domain registrations in this demo.
              </p>
              {learnMoreOpen ? (
                <button
                  type="button"
                  className="flex items-center gap-2 pt-1 text-sm font-semibold text-[var(--modulr-accent)] transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
                  aria-expanded
                  aria-controls={learnId}
                  onClick={() => setLearnMoreOpen(false)}
                >
                  <span className="select-none text-[10px]" aria-hidden>
                    ▲
                  </span>
                  Collapse
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </GlassPanel>

      {hasHandle ? (
        <RegisterFormSection
          idPrefix="org-reg"
          title="Register an organization"
          description="Single label = whole delegated namespace. Completing a mock registration below doubles the $100 floor for the next buyer in this demo."
          label="Organization key"
          placeholder="e.g. acme or labs.acme"
          value={orgInput}
          onChange={(v) => {
            setOrgInput(v);
            setOrgSubmitNote(null);
          }}
          quote={orgQuote}
          previewVariant="org"
          availability={orgAvail}
          onMockSubmit={() => {
            const key = orgQuote.normalized;
            setMockOrganizationKey(key);
            setMockOrgKey(key);
            setOrgSubmitNote(
              `Mock only: you would confirm org registration for “${key}”. Next whole-domain anchor in this UI is now ${formatMockUsd(orgNamespaceAnchorUsd(orgMarketDepth + 1))}.`,
            );
            setOrgMarketDepth((d) => Math.min(d + 1, 20));
            notifyMockIdentityChanged();
          }}
          submitNote={orgSubmitNote}
        />
      ) : null}

      {hasHandle && hasOrg ? (
        <>
          <GlassPanel className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
                  Members &amp; roles
                </h2>
                <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">
                  Invite people by handle, assign owner / manager / member, and optionally model
                  ownership shares (mock).
                </p>
              </div>
              <span className="rounded-full border border-[var(--modulr-glass-border)] px-3 py-1 text-xs font-medium text-[var(--modulr-text-muted)]">
                Mock
              </span>
            </div>
            <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--modulr-glass-border)]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[var(--modulr-page-bg)]/30 text-xs uppercase tracking-wide text-[var(--modulr-text-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Share</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--modulr-glass-border)]">
                  {[
                    { who: `@${mockHandle} (you)`, role: "Owner", share: "—", status: "Active" },
                    { who: "@river", role: "Manager", share: "—", status: "Active" },
                    { who: "@moss", role: "Member", share: "2%", status: "Invited" },
                  ].map((row) => (
                    <tr key={row.who} className="text-[var(--modulr-text)]">
                      <td className="px-4 py-3 font-mono text-xs">{row.who}</td>
                      <td className="px-4 py-3">{row.role}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--modulr-text-muted)]">
                        {row.share}
                      </td>
                      <td className="px-4 py-3 text-xs">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              disabled
              className="mt-4 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-4 py-2 text-sm font-semibold text-[var(--modulr-text-muted)]"
              title="Coming soon"
            >
              Invite by handle (soon)
            </button>
          </GlassPanel>

          <GlassPanel className="p-6 sm:p-8">
            <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
              Treasury &amp; limits
            </h2>
            <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">
              Per-role spend caps from a shared org pool (mock sliders — no ledger calls).
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { label: "Daily spend cap (members)", v: "25k MOD" },
                { label: "Manager approval above", v: "100k MOD" },
              ].map((x) => (
                <div
                  key={x.label}
                  className="rounded-xl border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 px-4 py-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--modulr-text-muted)]">
                    {x.label}
                  </p>
                  <p className="mt-2 font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
                    {x.v}
                  </p>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6 sm:p-8">
            <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
              Application access
            </h2>
            <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">
              Toggle which Modulr network surfaces this org may use for non-owner roles (mock).
            </p>
            <div className="mt-2">
              <MockToggleRow
                label="Modulr.Code"
                description="Repositories and CI hooks for this org namespace."
              />
              <MockToggleRow
                label="Modulr.Assets"
                description="Public asset registry and provenance views."
                defaultOn={false}
              />
              <MockToggleRow label="Modulr.Storage" description="Encrypted vaults and policy." />
            </div>
          </GlassPanel>
        </>
      ) : hasHandle && !hasOrg ? (
        <GlassPanel className="p-6 sm:p-8">
          <p className="text-sm text-[var(--modulr-text)]">
            Complete <span className="font-medium">Register an organization</span> above to unlock
            members, treasury, and app policies for your org.
          </p>
          <p className="modulr-text-muted mt-2 text-xs">
            Tip: submitting the org form saves a mock org key in this browser so the panels can
            appear on the next visit.
          </p>
        </GlassPanel>
      ) : null}
    </div>
  );
}
