"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AnimatedBackground } from "@/components/background/AnimatedBackground";
import { IconGear } from "@/components/icons";
import { useAppUi } from "@/components/providers/AppProviders";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { useCoreVersion } from "@/hooks/useCoreVersion";

import { BrandMark } from "./BrandMark";
import { ThemeModeSwitch } from "./ThemeModeSwitch";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { setSettingsOpen } = useAppUi();
  const pathname = usePathname();
  const coreVersion = useCoreVersion();

  const chromeBtn =
    "modulr-glass-surface flex size-11 items-center justify-center rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-[var(--modulr-text)] shadow-lg transition-[border-color,color,box-shadow] duration-200 hover:border-[var(--modulr-accent)]/50 hover:text-[var(--modulr-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]";
  const chromeEase = { transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)" };

  return (
    <div className="modulr-text relative min-h-screen">
      <AnimatedBackground />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <div
              className="modulr-glass-surface flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-4 py-3 sm:flex-row sm:items-center sm:gap-10 md:gap-14 sm:px-5 sm:py-3"
              style={{
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 var(--modulr-glass-highlight)",
                ...chromeEase,
              }}
            >
              <Link
                href="/"
                aria-label="Modulr.Core home"
                aria-current={pathname === "/" ? "page" : undefined}
                className="flex min-w-0 shrink-0 items-start gap-3 rounded-xl outline-offset-2 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--modulr-accent)]"
              >
                <BrandMark />
                <div className="hidden min-w-0 flex-col gap-0.5 pt-px sm:flex">
                  <span className="modulr-text text-xs font-semibold leading-tight sm:text-sm">
                    Modulr.Core
                  </span>
                  <span
                    className="modulr-text-muted text-[10px] font-medium leading-tight tracking-wide"
                    title={
                      coreVersion.kind === "error"
                        ? coreVersion.message
                        : "Wire version from Core GET /version"
                    }
                  >
                    {coreVersion.kind === "loading"
                      ? "v…"
                      : coreVersion.kind === "ok"
                        ? `v${coreVersion.version}`
                        : "unreachable"}
                  </span>
                </div>
              </Link>
              <nav
                className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-x-10 gap-y-2 border-t border-[var(--modulr-glass-border)] pt-3 text-sm font-semibold tracking-tight text-[var(--modulr-text)] sm:border-t-0 sm:pt-0"
                aria-label="Core tools"
              >
                <Link
                  href="/registration"
                  aria-current={pathname === "/registration" ? "page" : undefined}
                  className={`transition-colors duration-200 hover:text-[var(--modulr-accent)] ${
                    pathname === "/registration"
                      ? "text-[var(--modulr-accent)]"
                      : ""
                  }`}
                >
                  Registration
                </Link>
                <Link
                  href="/resolve"
                  aria-current={pathname === "/resolve" ? "page" : undefined}
                  className={`transition-colors duration-200 hover:text-[var(--modulr-accent)] ${
                    pathname === "/resolve" ? "text-[var(--modulr-accent)]" : ""
                  }`}
                >
                  Resolve
                </Link>
                <Link
                  href="/methods"
                  aria-current={pathname === "/methods" ? "page" : undefined}
                  className={`transition-colors duration-200 hover:text-[var(--modulr-accent)] ${
                    pathname === "/methods" ? "text-[var(--modulr-accent)]" : ""
                  }`}
                >
                  Methods
                </Link>
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-3 sm:gap-4">
              <ThemeModeSwitch variant="header" />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className={chromeBtn}
                style={{
                  boxShadow:
                    "0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 var(--modulr-glass-highlight)",
                  transitionDuration: "0.55s",
                  ...chromeEase,
                }}
                aria-label="Open settings"
              >
                <IconGear />
              </button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col px-4 pb-12 pt-4 sm:px-8">
          <div className="mx-auto w-full max-w-6xl flex-1">{children}</div>
        </main>
      </div>

      <SettingsPanel />
    </div>
  );
}
