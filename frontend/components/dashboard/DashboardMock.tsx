"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CountUpNumber } from "@/components/dashboard/CountUpNumber";
import {
  getMockMetrics,
  getMockUserTypeMix,
  getMockValidatorStatusMix,
} from "@/components/dashboard/mockModuleMetrics";
import { MockDonutChart } from "@/components/dashboard/MockDonutChart";
import { MockHealthActivityChart } from "@/components/dashboard/MockHealthActivityChart";
import { GlassPanel } from "@/components/shell/GlassPanel";

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <GlassPanel className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--modulr-text-muted)]">
        {label}
      </p>
      <p className="font-modulr-display mt-2 text-2xl font-bold tabular-nums text-[var(--modulr-text)]">
        <CountUpNumber value={value} />
      </p>
      {hint ? (
        <p className="modulr-text-muted mt-1 text-xs leading-relaxed">{hint}</p>
      ) : null}
    </GlassPanel>
  );
}

const DEFAULT_MODULE_ID = "Modulr.Core";

export function DashboardMock() {
  const [moduleId, setModuleId] = useState(DEFAULT_MODULE_ID);
  const metrics = useMemo(
    () => getMockMetrics(moduleId),
    [moduleId],
  );
  const userTypeSlices = useMemo(
    () => getMockUserTypeMix(moduleId),
    [moduleId],
  );
  const validatorStatusSlices = useMemo(
    () => getMockValidatorStatusMix(moduleId),
    [moduleId],
  );
  const chartSeed = moduleId.trim() || DEFAULT_MODULE_ID;
  const isCoreModule = moduleId.trim().toLowerCase() === "modulr.core";

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="inspect-heading">
        <GlassPanel className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1
                id="inspect-heading"
                className="font-modulr-display text-xl font-bold text-[var(--modulr-text)] sm:text-2xl"
              >
                Inspect module
              </h1>
              <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">
                Metrics and activity for the selected module id. Core version lives in the
                header. Numbers below are{" "}
                <span className="font-medium text-[var(--modulr-text)]">demonstration data</span>{" "}
                — they animate and shift when you change the module id.
              </p>
            </div>
            <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1 text-xs font-medium text-[var(--modulr-text-muted)]">
              Mock metrics
            </span>
          </div>

          <label
            className="mt-6 block text-xs font-medium text-[var(--modulr-text-muted)]"
            htmlFor="module-inspect-id"
          >
            Module id
          </label>
          <input
            id="module-inspect-id"
            type="search"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            placeholder="e.g. Modulr.Core"
            className="mt-1 max-w-xl rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2.5 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2"
            aria-label="Module id to inspect"
            autoComplete="off"
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              label="Active connections"
              value={metrics.connections}
              hint="Peers / clients for this module’s scope."
            />
            <MetricCard
              label="Modules"
              value={metrics.modules}
              hint="Related or dependent modules when Core returns graph data."
            />
            <MetricCard
              label="Organizations"
              value={metrics.orgs}
              hint="Orgs touching this module."
            />
            <MetricCard
              label="Users"
              value={metrics.users}
              hint="Distinct users where identity is available."
            />
            <MetricCard
              label="Validators"
              value={metrics.validators}
              hint="Validators participating for this module / chain context."
            />
            {!isCoreModule ? (
              <MetricCard
                label="Providers subscribed"
                value={metrics.providersSubscribed}
                hint="Providers actively subscribed to this module’s services."
              />
            ) : null}
          </div>

          <div className="mt-8 border-t border-[var(--modulr-glass-border)] pt-8">
            <h2
              id="composition-heading"
              className="font-modulr-display text-sm font-bold text-[var(--modulr-text)]"
            >
              Composition
            </h2>
            <p className="modulr-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
              Default donut pair:{" "}
              <span className="font-medium text-[var(--modulr-text)]">user mix</span> (clients,
              validator-role users, providers) and{" "}
              <span className="font-medium text-[var(--modulr-text)]">validator health</span>{" "}
              (active vs passive vs offline — center total matches the Validators card). Hover a
              slice for count and percentage. Grid supports up to four pies for module-specific
              views later.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4 sm:p-5 xl:min-w-0">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
                  User mix
                </p>
                <p className="modulr-text-muted mx-auto mt-1 max-w-[14rem] text-center text-[11px] leading-snug">
                  Share of all users by role (not the validator fleet count).
                </p>
                <div className="mt-4">
                  <MockDonutChart
                    slices={userTypeSlices}
                    centerLabel="USERS"
                    ariaLabel="User mix: clients, validator users, and providers."
                    legendMode="hover"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4 sm:p-5">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
                  Validator status
                </p>
                <p className="modulr-text-muted mx-auto mt-1 max-w-[14rem] text-center text-[11px] leading-snug">
                  Active, passive (standby), and offline vs heartbeat window (mock).
                </p>
                <div className="mt-4">
                  <MockDonutChart
                    slices={validatorStatusSlices}
                    centerLabel="VALIDATORS"
                    ariaLabel="Validator status: active, passive, and offline."
                    legendMode="hover"
                  />
                </div>
              </div>
              <div className="hidden min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)]/15 p-4 text-center xl:flex">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--modulr-text-muted)]">
                  Reserved
                </p>
                <p className="modulr-text-muted mt-2 max-w-[10rem] text-[11px] leading-snug">
                  e.g. modulr.core–specific mix when you define it.
                </p>
              </div>
              <div className="hidden min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)]/15 p-4 text-center xl:flex">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--modulr-text-muted)]">
                  Reserved
                </p>
                <p className="modulr-text-muted mt-2 max-w-[10rem] text-[11px] leading-snug">
                  Fourth pie slot — same row on wide screens.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-[var(--modulr-glass-border)] pt-8">
            <h2 className="font-modulr-display text-sm font-bold text-[var(--modulr-text)]">
              Health & activity
            </h2>
            <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
              For{" "}
              <span className="font-medium text-[var(--modulr-text)]">
                {moduleId.trim() || DEFAULT_MODULE_ID}
              </span>
              — gold is mock network activity (request volume); red is mock errors. Hover the
              chart for req/min and error rate. In production, Core may stay error-free while
              peers report here.
            </p>
            <div className="mt-6">
              <MockHealthActivityChart seedKey={chartSeed} />
            </div>
          </div>
        </GlassPanel>
      </section>

      <section aria-labelledby="news-heading" className="w-full">
        <GlassPanel className="p-6 sm:p-8">
          <h2
            id="news-heading"
            className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]"
          >
            News & updates
          </h2>
          <p className="modulr-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
            Launches, protocol notes, and module releases — CMS or Core feed later.
          </p>
          <ul className="mt-6 space-y-4">
            {[
              {
                title: "Inspect-first desktop",
                date: "Today",
                body: "Home is organized around a module id; change the field to preview another context.",
              },
              {
                title: "Featured modules",
                date: "Soon",
                body: "Full-width section below for curated picks and Add to Modulr.Desktop.",
              },
              {
                title: "Dashboard API milestone",
                date: "Planned",
                body: "Wire tiles and health strip to Core once aggregation endpoints land.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="border-b border-[var(--modulr-glass-border)] pb-4 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-[var(--modulr-text)]">{item.title}</span>
                  <time className="text-xs text-[var(--modulr-text-muted)]">{item.date}</time>
                </div>
                <p className="modulr-text-muted mt-1 text-sm leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ul>
        </GlassPanel>
      </section>

      <section aria-labelledby="featured-heading" className="w-full">
        <GlassPanel className="p-6 sm:p-8">
          <h2
            id="featured-heading"
            className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]"
          >
            Featured modules
          </h2>
          <p className="modulr-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
            Flagship Modulr products surfaced on the desktop.{" "}
            <span className="font-medium text-[var(--modulr-text)]">Launch</span> will open
            the experience when wired;{" "}
            <span className="font-medium text-[var(--modulr-text)]">Learn more</span> goes
            to each product page (placeholder content for now).
          </p>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                name: "Modulr.Assets",
                desc: "Digital asset issuance, custody context, and registry-aligned metadata for the network.",
                href: "/products/modulr-assets",
              },
              {
                name: "Modulr.Storage",
                desc: "Durable object and blob tiering with protocol-aware quotas and module-scoped access.",
                href: "/products/modulr-storage",
              },
              {
                name: "Modulr.Desktop",
                desc: "Your workspace shell — run featured modules, shortcuts, and session-aware layouts.",
                href: "/products/modulr-desktop",
              },
            ].map((m) => (
              <li
                key={m.name}
                className="flex flex-col gap-4 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] p-5"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--modulr-text)]">{m.name}</p>
                  <p className="modulr-text-muted mt-1 text-sm leading-relaxed">{m.desc}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-[var(--modulr-accent)]/55 bg-[var(--modulr-accent)]/18 px-3 py-2 text-xs font-semibold text-[var(--modulr-accent)] shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-85"
                    title="Coming soon — will open this product in context"
                  >
                    Launch
                  </button>
                  <Link
                    href={m.href}
                    className="rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-3 py-2 text-xs font-medium text-[var(--modulr-text-muted)] transition-colors hover:border-[var(--modulr-text-muted)]/40 hover:text-[var(--modulr-text)]"
                  >
                    Learn more
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </GlassPanel>
      </section>
    </div>
  );
}
