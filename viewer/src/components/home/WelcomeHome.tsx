"use client";

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { ExploreNetworkModules } from "@/components/home/ExploreNetworkModules";
import { RecommendedNextShell } from "@/components/home/RecommendedNextShell";
import { GlassPanel } from "@/components/shell/GlassPanel";
import { useShellSignedIn } from "@/hooks/useShellSignedIn";
import {
  isShellSignInLocationHash,
  routeToShellSignInSection,
  SHELL_SIGN_IN_SECTION_ID,
} from "@/lib/shellDeepLinks";
import { setMockShellAuthKind, setShellSignedIn } from "@/lib/mockShellIdentity";

/**
 * Public landing — dashboard-style layout aligned with Modulr.Code: primary column + Explore rail.
 */
function connectDemoWalletSession() {
  setMockShellAuthKind("wallet");
  setShellSignedIn(true);
}

export function WelcomeHome() {
  const shellSignedIn = useShellSignedIn();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") return;
    if (!isShellSignInLocationHash(location.hash)) return;
    const el = document.getElementById(SHELL_SIGN_IN_SECTION_ID);
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [location.pathname, location.hash]);

  return (
    <div className="mx-auto w-full max-w-[1520px] pb-16">
      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_min(440px,42vw)] lg:items-stretch lg:gap-10 xl:gap-12">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="text-center sm:text-left">
            <p className="font-modulr-display text-xs font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
              Welcome
            </p>
            <h1 className="font-modulr-display mt-3 text-3xl font-bold tracking-tight text-[var(--modulr-text)] sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
              Welcome to the network hub.
            </h1>
            <p className="modulr-text-muted mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:mx-0 sm:text-lg">
              <span className="font-medium text-[var(--modulr-text)]">Modulr.Core</span> is the
              coordination layer for the Modulr network — discovery, identity, and signed operations
              so modules and people can find each other.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <span className="inline-flex rounded-full border border-[var(--modulr-glass-border)] bg-[color-mix(in_srgb,var(--modulr-page-bg)_50%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
                Core shell · preview
              </span>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => connectDemoWalletSession()}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[var(--modulr-accent)] px-8 text-sm font-bold text-[var(--modulr-accent-contrast)] shadow-[0_8px_28px_rgba(255,183,0,0.25)] transition-opacity hover:opacity-95"
              >
                {shellSignedIn ? "Connected (demo)" : "Sign in (demo)"}
              </button>
              <Link
                to={shellSignedIn ? "/profile" : routeToShellSignInSection}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-panel-fill)] px-8 text-sm font-bold text-[var(--modulr-text)] shadow-[inset_0_1px_0_var(--modulr-glass-highlight)] transition-colors hover:border-[var(--modulr-accent)]/40 hover:text-[var(--modulr-accent)]"
              >
                Create a profile
              </Link>
            </div>
            {!shellSignedIn ? (
              <p className="modulr-text-muted mt-4 max-w-xl text-xs leading-relaxed">
                Sign in (demo) unlocks <span className="font-medium text-[var(--modulr-text)]">Profile</span>{" "}
                and <span className="font-medium text-[var(--modulr-text)]">Organizations</span> in the
                header — same session we&apos;ll replace with a real wallet later.
              </p>
            ) : null}
          </section>

          <section id={SHELL_SIGN_IN_SECTION_ID} className="scroll-mt-24">
            <GlassPanel className="p-6 sm:p-8 md:p-10">
            <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
              Sign in
            </h2>
            <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">
              Choose how you want to use the shell. Keys stay on-device for wallet paths; Google and
              Apple use industry-standard OAuth when we connect them.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => connectDemoWalletSession()}
                className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 px-5 py-3 text-left text-sm font-semibold text-[var(--modulr-text)] transition-colors hover:border-[var(--modulr-accent)]/35 sm:min-w-[200px]"
              >
                <span className="block text-[var(--modulr-accent)]">Wallet</span>
                <span className="modulr-text-muted mt-1 block text-xs font-normal">
                  Connect keys (demo — local session only)
                </span>
              </button>
              <button
                type="button"
                disabled
                className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 px-5 py-3 text-left text-sm font-semibold text-[var(--modulr-text)] opacity-80 transition-colors disabled:cursor-not-allowed sm:min-w-[200px]"
                title="Coming soon — Google account linking"
              >
                <span className="block text-[var(--modulr-accent)]">Google</span>
                <span className="modulr-text-muted mt-1 block text-xs font-normal">
                  Continue with Google (SSO)
                </span>
              </button>
              <button
                type="button"
                disabled
                className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 px-5 py-3 text-left text-sm font-semibold text-[var(--modulr-text)] opacity-80 transition-colors disabled:cursor-not-allowed sm:min-w-[200px]"
                title="Coming soon — Sign in with Apple"
              >
                <span className="block text-[var(--modulr-accent)]">Apple</span>
                <span className="modulr-text-muted mt-1 block text-xs font-normal">
                  Continue with Apple (SSO)
                </span>
              </button>
            </div>
            <p className="modulr-text-muted mt-4 text-xs leading-relaxed">
              Resolve, Inspector, and Methods stay available without signing in. Profile and
              Organizations require a session — settings (gear) holds Core URLs and theme for everyone.
            </p>
            </GlassPanel>
          </section>

          <RecommendedNextShell />
        </div>

        <aside className="w-full lg:sticky lg:top-[5.5rem] lg:self-start">
          <ExploreNetworkModules />
        </aside>
      </div>
    </div>
  );
}
