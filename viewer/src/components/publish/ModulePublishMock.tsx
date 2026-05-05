"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { GlassPanel } from "@/components/shell/GlassPanel";
import { SignInRequiredScreen } from "@/components/shell/SignInRequiredScreen";
import { useShellSignedIn } from "@/hooks/useShellSignedIn";
import { ModulrSelect, type ModulrSelectOption } from "@/components/ui/ModulrSelect";

import { modulrMarkdownToPreviewHtml } from "./markdownPreview";
import { DEFAULT_MODULE_TOS_MARKDOWN } from "./publishDefaults";

const controlClass =
  "box-border min-h-[2.5rem] w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm leading-5 text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";
const inputClass = `mt-1.5 ${controlClass}`;
/** Native select styled to match Modulr inputs (accent chevron, glass fill). */
const selectFieldClass = `${controlClass} mt-1.5 appearance-none cursor-pointer py-2.5 pl-3 pr-10 text-[var(--modulr-text)] [color-scheme:dark]`;
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]";

/** Time granularity for trial allowance and subscription/free plan caps. */
const TIME_MEASUREMENT_UNIT_OPTIONS: ModulrSelectOption[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

/**
 * Shown as a copy-friendly starting point — real SDK names will differ when Core ships.
 * Promos / first-time discounts: apply inside your quote path so checkout matches the buyer-facing price.
 */
const CUSTOM_PRICING_EXAMPLE_TS = `// Illustrative only — align debits with Price + Billing notes on your listing.

/** Pay-as-you-go: e.g. per API call into a licensed primitive (decode, enrich, …). */
export function creditsForOperation(opId: string): number {
  switch (opId) {
    case "video.decode.h264":
      return 12;
    case "video.decode.h265":
      return 20;
    default:
      return 4;
  }
}

/** Time-based: map wall-clock in service to credits (Modulr can measure duration). */
export function creditsForSessionHours(hours: number, creditsPerHour: number): number {
  return Math.ceil(hours * creditsPerHour);
}

/** Trial: mirror "Trial amount" + unit from the publish form in your ledger. */
export function trialCovers(amountUsed: number, trialAllowance: number): boolean {
  return amountUsed < trialAllowance;
}

/** Subscription cap: hard stop vs overage is your policy — state it in Billing notes. */
export type AfterCap = "in_plan" | "overage_payg" | "blocked";

export function afterIncludedUnits(used: number, included: number): AfterCap {
  if (used <= included) return "in_plan";
  return "overage_payg";
}
`;

function countNonEmptyLines(s: string): number {
  return s.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

/** Fallback mark when no custom logo yet — usually org-derived; product may refine the default. */
function placeholderOrgInitials(orgSlug: string): string {
  const s = orgSlug.trim().toLowerCase();
  if (!s) return "?";
  const parts = s.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[1]?.[0];
    if (a && b) return (a + b).toUpperCase();
  }
  const one = parts[0] ?? s;
  return one.slice(0, 2).toUpperCase() || "?";
}

function SelectChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--modulr-accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CameraGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function TrashGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

type MoneyModel = "subscription" | "payg" | "free";

/** How this module&apos;s billable usage is conceptualized — time is network-enforced; custom is code-defined meters. */
type UsageUnitBasis = "time" | "custom";

function modulrDateVersionString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}.0`;
}

const CONTENT_RATINGS = [
  { id: "E", label: "E — Everyone", hint: "Broadest audience; mild content." },
  { id: "E10", label: "E10+ — Everyone 10+", hint: "May contain more cartoon fantasy or mild language." },
  { id: "T", label: "T — Teen", hint: "Violence, suggestive themes, crude humor." },
  { id: "M", label: "M — Mature", hint: "Intense violence, blood, strong language." },
  { id: "A", label: "A — Adults", hint: "Adults only; not suitable for minors." },
] as const;

type ContentRatingId = (typeof CONTENT_RATINGS)[number]["id"];

/** Toast severity — drives surface + text color (theme-aware via CSS variables). */
export type ModulrToastLevel = "neutral" | "info" | "success" | "warning" | "error";

function toastSurfaceClass(level: ModulrToastLevel): string {
  switch (level) {
    case "error":
      return "border-[color:var(--modulr-toast-error-border)] bg-[color:var(--modulr-toast-error-surface)] text-[color:var(--modulr-status-error-fg)]";
    case "warning":
      return "border-[color:var(--modulr-toast-warning-border)] bg-[color:var(--modulr-toast-warning-surface)] text-[color:var(--modulr-status-warn-fg)]";
    case "success":
      return "border-[color:var(--modulr-toast-success-border)] bg-[color:var(--modulr-toast-success-surface)] text-[color:var(--modulr-status-success-fg)]";
    case "info":
      return "border-[color:var(--modulr-toast-info-border)] bg-[color:var(--modulr-toast-info-surface)] text-[color:var(--modulr-status-info-fg)]";
    default:
      return "border-[color:var(--modulr-toast-neutral-border)] bg-[color:var(--modulr-toast-neutral-surface)] text-[var(--modulr-text)]";
  }
}

/**
 * Developer-facing module publication flow (preview): pricing, ratings, ToS (Markdown),
 * certification / MTR, multi-role packages, listing icon. Wire to Core/registry when ready.
 */
export function ModulePublishMock() {
  const shellSignedIn = useShellSignedIn();
  const formId = useId();

  const [moduleName, setModuleName] = useState("");
  const [moduleSlug, setModuleSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [version, setVersion] = useState(() => modulrDateVersionString());
  const [contentRating, setContentRating] = useState<ContentRatingId>("E");
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconFileName, setIconFileName] = useState<string | null>(null);
  const [publishToast, setPublishToast] = useState<{ message: string; level: ModulrToastLevel } | null>(null);
  const publishToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [moneyModel, setMoneyModel] = useState<MoneyModel>("payg");
  const [usageUnitBasis, setUsageUnitBasis] = useState<UsageUnitBasis>("time");
  const [listedPrice, setListedPrice] = useState("");
  /** Catalog method id, export name, or wire key — whatever resolves custom metering in production. */
  const [customRateMethodRef, setCustomRateMethodRef] = useState("");
  /** Optional plan-wide cap for subscription & free only (not PAYG — billed per increment). */
  const [includedUsageCap, setIncludedUsageCap] = useState("");
  /** Period for the cap amount when billing basis is time. */
  const [includedCapTimeUnit, setIncludedCapTimeUnit] = useState<string>("hours");
  /** Method / meter id for the cap when billing basis is custom (often matches rate method above). */
  const [customCapMethodRef, setCustomCapMethodRef] = useState("");
  const [billingNotes, setBillingNotes] = useState("");
  /** Trial for subscription / PAYG: amount + unit (time or custom meter) — see Unit of measurement fieldset. */
  const [trialAllowanceValue, setTrialAllowanceValue] = useState("");
  const [trialTimeUnit, setTrialTimeUnit] = useState("minutes");
  const [trialCustomMethodRef, setTrialCustomMethodRef] = useState("");
  const [freeCapMinutes, setFreeCapMinutes] = useState("0");
  const [freeCooldownMinutes, setFreeCooldownMinutes] = useState("0");

  const [knownRoutersText, setKnownRoutersText] = useState("");
  const [unknownRouterCount, setUnknownRouterCount] = useState("0");
  const [knownProvidersText, setKnownProvidersText] = useState("");
  const [unknownProviderCount, setUnknownProviderCount] = useState("0");

  const [termsOfService, setTermsOfService] = useState(DEFAULT_MODULE_TOS_MARKDOWN);
  const [certificationRequested, setCertificationRequested] = useState(false);
  const [submitNote, setSubmitNote] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(true);
  const [tosView, setTosView] = useState<"edit" | "preview">("edit");

  const [archiveClient, setArchiveClient] = useState<string | null>(null);
  const [archiveProvider, setArchiveProvider] = useState<string | null>(null);
  const [archiveRouter, setArchiveRouter] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
    };
  }, [iconPreview]);

  useEffect(() => {
    return () => {
      if (publishToastTimerRef.current) clearTimeout(publishToastTimerRef.current);
    };
  }, []);

  function showPublishToast(message: string, level: ModulrToastLevel = "neutral") {
    setPublishToast({ message, level });
    if (publishToastTimerRef.current) clearTimeout(publishToastTimerRef.current);
    publishToastTimerRef.current = setTimeout(() => {
      setPublishToast(null);
      publishToastTimerRef.current = null;
    }, 4200);
  }

  function clearListingIcon() {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconPreview(null);
    setIconFileName(null);
  }

  const isFullyCentralizedTopology = useMemo(() => {
    const unkR = parseInt(unknownRouterCount.trim() || "0", 10);
    const unkP = parseInt(unknownProviderCount.trim() || "0", 10);
    const r = Number.isFinite(unkR) ? unkR : 0;
    const p = Number.isFinite(unkP) ? unkP : 0;
    return countNonEmptyLines(knownRoutersText) === 0 && r === 0 && countNonEmptyLines(knownProvidersText) === 0 && p === 0;
  }, [knownRoutersText, knownProvidersText, unknownRouterCount, unknownProviderCount]);

  const tosPreviewHtml = useMemo(() => modulrMarkdownToPreviewHtml(termsOfService), [termsOfService]);

  const estimateRows = useMemo(() => {
    const certMinUsd = certificationRequested ? 499 : 0;
    const rows: { label: string; detail?: string; amount: string }[] = [
      {
        label: "Catalog listing & submission",
        detail: "Preview shell — no charge",
        amount: "$0",
      },
      {
        label: "Certification audit",
        detail: certificationRequested ? "Starts at (formal quote at review)" : "Not requested",
        amount: certificationRequested ? "from $499" : "$0",
      },
      {
        label: "Your price model",
        detail: moneyModel === "free" ? "Free tier — see billing notes" : "See listed price & billing notes",
        amount: "Per your listing",
      },
    ];
    const subtotalLabel = "Estimated Modulr fees (audit)";
    const subtotal = certMinUsd > 0 ? `from $${certMinUsd}` : "$0";
    return { rows, subtotalLabel, subtotal };
  }, [certificationRequested, moneyModel]);

  if (!shellSignedIn) {
    return (
      <SignInRequiredScreen
        title="Sign in to publish a module"
        description="Listing modules, pricing, and certification requests will be tied to an authenticated developer identity. Use the demo session on the home dashboard for now."
      />
    );
  }

  /** @returns whether the file was accepted (SVG). */
  function onIconChange(f: File | undefined): boolean {
    if (!f) {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      setIconPreview(null);
      setIconFileName(null);
      return true;
    }
    const name = f.name.toLowerCase();
    const isSvg = name.endsWith(".svg") || f.type === "image/svg+xml";
    if (!isSvg) {
      showPublishToast("This does not support this file format. SVG only.", "error");
      return false;
    }
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconFileName(f.name);
    setIconPreview(URL.createObjectURL(f));
    return true;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitNote(
      "Preview only — nothing was uploaded. Production will validate packages, run audits, fee schedules for certification, and attach billing + rating + certification state to your namespace.",
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-16">
      <div>
        <p className="font-modulr-display text-xs font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Developer
        </p>
        <h1 className="font-modulr-display mt-2 text-3xl font-bold tracking-tight text-[var(--modulr-text)] sm:text-4xl">
          Publish a module
        </h1>
        <p className="modulr-text-muted mt-3 max-w-3xl text-sm leading-relaxed">
          Register your module for discovery, set commercial terms, declare how much decentralization you
          want (known vs unknown routers and providers), set a mandatory content rating, optionally
          request <span className="font-medium text-[var(--modulr-text)]">Modulr certification</span> for
          MTR eligibility, and attach role-specific builds. Submission endpoints will connect to Core and
          the registry later.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        <GlassPanel className="p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Module identity
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            Public <span className="font-medium text-[var(--modulr-text)]">display name</span>, the{" "}
            <span className="font-medium text-[var(--modulr-text)]">organization</span> that owns this listing,
            <span className="font-medium text-[var(--modulr-text)]"> Modulr calendar version</span> (
            <span className="font-mono text-xs">YYYY.MM.DD.N</span>), and a mandatory content rating. We verify org
            ownership before checkout; registering an org stays its own step for now (inline registration later).
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <div>
              <label className={labelClass} htmlFor={`${formId}-name`}>
                Display name
              </label>
              <input
                id={`${formId}-name`}
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder="e.g. Acme Metrics Bridge"
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${formId}-slug`}>
                Organization
              </label>
              <p className="modulr-text-muted mb-1.5 text-[10px] leading-snug">
                Org namespace you control — ownership checked before publish.
              </p>
              <input
                id={`${formId}-slug`}
                value={moduleSlug}
                onChange={(e) => setModuleSlug(e.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase())}
                placeholder="e.g. acme.media"
                className={`${inputClass} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${formId}-ver`}>
                Version <span className="font-normal opacity-80">(YYYY.MM.DD.N)</span>
              </label>
              <input
                id={`${formId}-ver`}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="2026.04.20.0"
                className={`${inputClass} font-mono text-xs`}
                title="Modulr calendar version: year.month.day.subversion"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${formId}-rating`}>
                Content rating
              </label>
              <p className="modulr-text-muted mb-1.5 text-[10px] leading-snug">Mandatory · ESRB-style</p>
              <div className="relative">
                <select
                  id={`${formId}-rating`}
                  value={contentRating}
                  onChange={(e) => setContentRating(e.target.value as ContentRatingId)}
                  className={selectFieldClass}
                >
                  {CONTENT_RATINGS.map((r) => (
                    <option
                      key={r.id}
                      value={r.id}
                      className="bg-[var(--modulr-page-bg)] text-[var(--modulr-text)]"
                    >
                      {r.label} — {r.hint}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>
          </div>
          <p className="modulr-text-muted mt-3 text-[11px] leading-relaxed xl:mt-4">
            Ratings describe audience fit; future capability-based checks can align with decentralized age verification
            without storing birthdays in the obvious way.
          </p>
          {/* lg: shared row height = textarea; preview is aspect-square with h-full so width follows height (no max-w on square). */}
          <div className="mt-6 grid grid-cols-1 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] lg:gap-x-4 lg:gap-y-1.5 xl:gap-x-5">
            <label
              className={`${labelClass} order-1 lg:col-start-1 lg:row-start-1`}
              htmlFor={`${formId}-sum`}
            >
              Summary
            </label>
            <textarea
              id={`${formId}-sum`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What the module does, who it is for, and how it uses Core."
              rows={5}
              className={`${inputClass} order-2 modulr-scrollbar min-h-[7.5rem] w-full min-h-0 resize-y lg:col-start-1 lg:row-start-2 lg:mt-0`}
            />
            <p className={`${labelClass} order-3 mb-0 lg:col-start-2 lg:row-start-1`}>Listing icon</p>
            <div className="order-4 flex min-h-0 w-full min-w-0 flex-col overflow-visible lg:col-start-2 lg:row-start-2 lg:h-full lg:min-h-0">
              <div className="flex min-h-[7.5rem] w-full flex-1 items-stretch justify-end overflow-visible lg:min-h-0 lg:h-full">
                <div
                  className="relative aspect-square h-full w-auto max-w-none shrink-0 overflow-visible lg:max-h-none"
                  title={iconFileName ?? undefined}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/30 p-2 sm:p-3">
                    {iconPreview ? (
                      <img
                        src={iconPreview}
                        alt="Listing icon preview"
                        className="mx-auto block max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span
                        className="flex h-full items-center justify-center font-modulr-display text-3xl font-bold tracking-tight text-[var(--modulr-accent)] sm:text-4xl"
                        role="img"
                        aria-label={`Placeholder (${placeholderOrgInitials(moduleSlug)})`}
                      >
                        {placeholderOrgInitials(moduleSlug)}
                      </span>
                    )}
                  </div>
                  {!iconPreview ? (
                    <label className="absolute right-0 top-0 z-20 inline-flex size-10 translate-x-[46%] cursor-pointer items-center justify-center rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/95 text-[var(--modulr-accent)] shadow-md backdrop-blur-sm transition-colors hover:border-[var(--modulr-accent)]/50 hover:bg-[var(--modulr-page-bg)]">
                      <span className="sr-only">Choose listing icon file</span>
                      <CameraGlyph className="size-4" />
                      <input
                        type="file"
                        accept="image/*,.svg"
                        className="sr-only"
                        onChange={(e) => {
                          const ok = onIconChange(e.target.files?.[0]);
                          if (!ok) e.target.value = "";
                        }}
                      />
                    </label>
                  ) : (
                    <button
                      type="button"
                      className="absolute right-0 top-0 z-20 inline-flex size-10 translate-x-[46%] items-center justify-center rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/95 text-[var(--modulr-accent)] shadow-md backdrop-blur-sm transition-colors hover:border-[var(--modulr-accent)]/50 hover:bg-[var(--modulr-page-bg)]"
                      aria-label="Remove listing icon"
                      onClick={clearListingIcon}
                    >
                      <TrashGlyph className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Pricing &amp; money model
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            Subscription and pay-as-you-go can include an optional <span className="font-medium text-[var(--modulr-text)]">trial</span>{" "}
            (under <span className="font-medium text-[var(--modulr-text)]">Unit of measurement</span>) in the same units as
            your basis: <span className="font-medium text-[var(--modulr-text)]">time</span> (minutes through months) or{" "}
            <span className="font-medium text-[var(--modulr-text)]">custom</span> (amount + method/meter id you implement in
            code). <span className="font-medium text-[var(--modulr-text)]">Free</span> can be unlimited (cap{" "}
            <span className="font-mono">0</span> minutes) or time-boxed per session with cooldown so providers aren&apos;t
            drained indefinitely. Trust requirements tie to pricing — abuse risks losing MTR access and participation.
            <span className="font-medium text-[var(--modulr-text)]"> Custom</span> is ideal for API-metered primitives,
            borrowed paid functions from other modules, and promos you encode in your quote path so checkout matches what
            buyers read. Rails like invoicing, wallets, credits, and marketplace splits can layer on in Core later.
          </p>
          <fieldset className="mt-6">
            <legend className="sr-only">Money model</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["subscription", "Subscription"],
                  ["payg", "Pay as you go"],
                  ["free", "Free"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMoneyModel(id)}
                  className={`rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                    moneyModel === id
                      ? "border-[var(--modulr-accent)] bg-[var(--modulr-accent)]/12 text-[var(--modulr-text)]"
                      : "border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 text-[var(--modulr-text-muted)] hover:border-[var(--modulr-accent)]/30"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {moneyModel === "free" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor={`${formId}-freecap`}>
                  Free access cap (minutes)
                </label>
                <input
                  id={`${formId}-freecap`}
                  inputMode="numeric"
                  value={freeCapMinutes}
                  onChange={(e) => setFreeCapMinutes(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="modulr-text-muted mt-1 text-[11px]">
                  <span className="font-mono">0</span> = always free for any duration. Above{" "}
                  <span className="font-mono">0</span> = that many minutes per window before the user must stop; after
                  cooldown they can start another window.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor={`${formId}-cool`}>
                  Cooldown (minutes)
                </label>
                <input
                  id={`${formId}-cool`}
                  inputMode="numeric"
                  value={freeCooldownMinutes}
                  onChange={(e) => setFreeCooldownMinutes(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="modulr-text-muted mt-1 text-[11px]">
                  Wait time before a consumer can start a new free window (meaningful when cap &gt; 0).
                </p>
              </div>
            </div>
          )}

          <fieldset className="mt-6">
            <legend className={labelClass}>Unit of measurement</legend>
            <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
              <span className="font-medium text-[var(--modulr-text)]">Time</span> — Modulr can measure duration in service
              consistently. <span className="font-medium text-[var(--modulr-text)]">Custom</span> — you point to the method
              or meter that decides credits (API calls, decode jobs, borrowed primitives, tiered ladders); list a headline
              price and explain the rules in billing notes so storefront copy matches what your code charges.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["time", "Time"],
                  ["custom", "Custom"],
                ] as const satisfies readonly [UsageUnitBasis, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setUsageUnitBasis(id)}
                  className={`rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                    usageUnitBasis === id
                      ? "border-[var(--modulr-accent)] bg-[var(--modulr-accent)]/12 text-[var(--modulr-text)]"
                      : "border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 text-[var(--modulr-text-muted)] hover:border-[var(--modulr-accent)]/30"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <details
              key={usageUnitBasis}
              className="mt-4 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 [&_summary]:cursor-pointer"
              defaultOpen={usageUnitBasis === "custom"}
            >
              <summary className="px-3 py-2.5 text-xs font-semibold text-[var(--modulr-text)]">
                Example: pricing hooks in code (starting point)
              </summary>
              <div className="border-t border-[var(--modulr-glass-border)] px-3 pb-3 pt-2">
                <p className="modulr-text-muted text-[11px] leading-relaxed">
                  Names are illustrative. Put promos and first-time discounts inside your quote/debit path so the buyer
                  never pays full price and waits on a refund — the listing fields stay the honest summary of typical
                  charges.
                </p>
                <pre className="modulr-scrollbar mt-2 max-h-[min(22rem,50vh)] w-full overflow-auto rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] p-3 font-mono text-[11px] leading-snug text-[var(--modulr-text)]">
                  {CUSTOM_PRICING_EXAMPLE_TS}
                </pre>
              </div>
            </details>

            {(moneyModel === "subscription" || moneyModel === "payg") && (
              <div className="mt-6 border-t border-[var(--modulr-glass-border)] pt-5">
                <p className={labelClass}>Trial allowance</p>
                <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                  Optional free allowance before paid rules apply. Use <span className="font-mono">0</span> for amount to
                  mean no trial. Units follow your <span className="font-medium text-[var(--modulr-text)]">Time</span> or{" "}
                  <span className="font-medium text-[var(--modulr-text)]">Custom</span> choice above.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-start">
                  <div>
                    <label className={labelClass} htmlFor={`${formId}-trial-amount`}>
                      Trial amount
                    </label>
                    <input
                      id={`${formId}-trial-amount`}
                      inputMode="numeric"
                      value={trialAllowanceValue}
                      onChange={(e) => setTrialAllowanceValue(e.target.value.replace(/\D/g, ""))}
                      placeholder="0 = no trial"
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>
                  {usageUnitBasis === "time" ? (
                    <div>
                      <label className={labelClass} htmlFor={`${formId}-trial-time-unit`}>
                        Trial unit
                      </label>
                      <div className="mt-1.5">
                        <ModulrSelect
                          id={`${formId}-trial-time-unit`}
                          value={trialTimeUnit}
                          onChange={setTrialTimeUnit}
                          options={TIME_MEASUREMENT_UNIT_OPTIONS}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClass} htmlFor={`${formId}-trial-custom-method`}>
                        Trial meter / method id
                      </label>
                      <input
                        id={`${formId}-trial-custom-method`}
                        value={trialCustomMethodRef}
                        onChange={(e) => setTrialCustomMethodRef(e.target.value)}
                        placeholder="e.g. decode:h264#trial, meters.api_call"
                        className={`${inputClass} font-mono text-xs`}
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </fieldset>

          <div className="mt-6 grid gap-5">
            <div
              className={
                usageUnitBasis === "custom"
                  ? "grid gap-4 sm:grid-cols-2 sm:items-start"
                  : "grid grid-cols-1 gap-4"
              }
            >
              <div>
                <label className={labelClass} htmlFor={`${formId}-listed-price`}>
                  Price
                </label>
                <input
                  id={`${formId}-listed-price`}
                  value={listedPrice}
                  onChange={(e) => setListedPrice(e.target.value)}
                  placeholder={
                    moneyModel === "subscription"
                      ? "e.g. $29/mo per org"
                      : moneyModel === "payg"
                        ? usageUnitBasis === "custom"
                          ? "e.g. from $0.02 / decode (see billing notes)"
                          : "e.g. $0.002 per unit"
                        : "e.g. $0 (bundled) or sponsorship details"
                  }
                  className={inputClass}
                  autoComplete="off"
                />
                <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                  The headline number or formula buyers see before checkout — final quotes may still vary by tax and plan.
                </p>
              </div>
              {usageUnitBasis === "custom" ? (
                <div>
                  <label className={labelClass} htmlFor={`${formId}-custom-rate-method`}>
                    Rate method or meter id
                  </label>
                  <input
                    id={`${formId}-custom-rate-method`}
                    value={customRateMethodRef}
                    onChange={(e) => setCustomRateMethodRef(e.target.value)}
                    placeholder="e.g. exports.quoteDecode, catalog/primitives#h264"
                    className={`${inputClass} font-mono text-xs`}
                    autoComplete="off"
                  />
                  <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                    Pointer for buyers and for the runtime: which function or catalog entry turns usage into credits.
                    Borrowed paid primitives from other modules use the same pattern — wire-up resolves handles in
                    production.
                  </p>
                </div>
              ) : (
                <p className="modulr-text-muted rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 px-3 py-2 text-[11px] leading-relaxed sm:mt-7">
                  <span className="font-medium text-[var(--modulr-text)]">Time-based.</span> Price applies to duration in
                  service; trial (when subscription or PAYG) uses the time units in this section. Free session windows stay
                  in minutes above.
                </p>
              )}
            </div>

            {(moneyModel === "subscription" || moneyModel === "free") && (
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <div>
                  <label className={labelClass} htmlFor={`${formId}-usage-cap`}>
                    Included usage / plan cap{" "}
                    <span className="font-normal normal-case text-[var(--modulr-text-muted)]">(optional)</span>
                  </label>
                  <input
                    id={`${formId}-usage-cap`}
                    value={includedUsageCap}
                    onChange={(e) => setIncludedUsageCap(e.target.value)}
                    placeholder={
                      usageUnitBasis === "time"
                        ? "e.g. 40 (per billing period)"
                        : "e.g. 500 (per billing period)"
                    }
                    className={inputClass}
                    autoComplete="off"
                  />
                  <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                    For <span className="font-medium text-[var(--modulr-text)]">subscription</span> and{" "}
                    <span className="font-medium text-[var(--modulr-text)]">free</span> — what is included before overage
                    or fair-use. Session minute caps for free tiers stay above.{" "}
                    <span className="font-medium text-[var(--modulr-text)]">Pay as you go</span> omits this: each
                    increment is billed as used (soft limits belong in product policy, not a hard plan cap here).
                  </p>
                </div>
                <div>
                  {usageUnitBasis === "time" ? (
                    <>
                      <label className={labelClass} htmlFor={`${formId}-cap-time-unit`}>
                        Cap unit
                      </label>
                      <div className="mt-1.5">
                        <ModulrSelect
                          id={`${formId}-cap-time-unit`}
                          value={includedCapTimeUnit}
                          onChange={setIncludedCapTimeUnit}
                          options={TIME_MEASUREMENT_UNIT_OPTIONS}
                        />
                      </div>
                      <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                        The number on the left is interpreted in these{" "}
                        <span className="font-medium text-[var(--modulr-text)]">minutes, hours, days, weeks, or months</span>{" "}
                        (per your billing period copy in billing notes if needed).
                      </p>
                    </>
                  ) : (
                    <>
                      <label className={labelClass} htmlFor={`${formId}-cap-custom-method`}>
                        Cap meter / method id
                      </label>
                      <input
                        id={`${formId}-cap-custom-method`}
                        value={customCapMethodRef}
                        onChange={(e) => setCustomCapMethodRef(e.target.value)}
                        placeholder="Often matches rate method (e.g. gpu_hours#plan_cap)"
                        className={`${inputClass} font-mono text-xs`}
                        autoComplete="off"
                      />
                      <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                        Same pattern as price: the cap number applies against this meter in your code (can match{" "}
                        <span className="font-medium text-[var(--modulr-text)]">Rate method or meter id</span> above).
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor={`${formId}-billing-notes`}>
                Billing notes
              </label>
              <textarea
                id={`${formId}-billing-notes`}
                value={billingNotes}
                onChange={(e) => setBillingNotes(e.target.value)}
                placeholder="Explain billing for buyers: what is included, renewal, overage, support for disputes, and how this relates to Modulr fees."
                rows={4}
                className={`${inputClass} modulr-scrollbar resize-y min-h-[5rem]`}
              />
              <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
                Optional narrative for people purchasing from this listing — not a substitute for legal terms (use module
                ToS where it matters).
              </p>
            </div>
          </div>

          <p className="modulr-text-muted mt-5 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 text-xs leading-relaxed">
            <span className="font-medium text-[var(--modulr-text)]">Trust.</span> Participation may require posting
            trust aligned with your model — not staking rewards, but accountability if listings are abused. Severe or
            illicit abuse can forfeit MTR eligibility and access; free tiers need the same honesty as paid ones.
          </p>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Network topology &amp; participation
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            Modulr does not mandate full decentralization — you choose how open your module is. List who is allowed to
            act as a <span className="font-medium text-[var(--modulr-text)]">router</span> (validator) and as a{" "}
            <span className="font-medium text-[var(--modulr-text)]">provider</span>. Handles resolve to keys on the
            network. This metadata is <span className="font-medium text-[var(--modulr-text)]">published</span> with your
            listing.
          </p>
          {isFullyCentralizedTopology ? (
            <p className="mt-4 rounded-lg border border-[var(--modulr-accent)]/25 bg-[var(--modulr-accent)]/8 px-4 py-3 text-sm leading-relaxed text-[var(--modulr-text)]">
              <span className="font-semibold text-[var(--modulr-accent)]">Fully centralized topology.</span> No known or
              unknown routers or providers — suitable when you only run your own infra (e.g. a hosted service on the
              network without decentralized routing or third-party providers).
            </p>
          ) : null}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--modulr-accent)]">Routers (validators)</h3>
              <p className="modulr-text-muted mt-1 text-xs leading-relaxed">
                One <span className="font-mono">@handle</span> or key fingerprint per line — your known router set.
              </p>
              <label className="sr-only" htmlFor={`${formId}-known-routers`}>
                Known routers
              </label>
              <textarea
                id={`${formId}-known-routers`}
                value={knownRoutersText}
                onChange={(e) => setKnownRoutersText(e.target.value)}
                placeholder={"@my.router\nrouter.example/modulr"}
                rows={5}
                className={`${inputClass} modulr-scrollbar resize-y font-mono text-xs`}
              />
              <label className={`${labelClass} mt-3`} htmlFor={`${formId}-unk-r`}>
                Unknown routers (count)
              </label>
              <input
                id={`${formId}-unk-r`}
                inputMode="numeric"
                value={unknownRouterCount}
                onChange={(e) => setUnknownRouterCount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="modulr-text-muted mt-1 text-[11px]">
                Additional router slots filled by the network beyond your known list. Use <span className="font-mono">0</span>{" "}
                if none.
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--modulr-accent)]">Providers</h3>
              <p className="modulr-text-muted mt-1 text-xs leading-relaxed">
                Known parties that supply capacity or fulfillment into this module (one per line).
              </p>
              <label className="sr-only" htmlFor={`${formId}-known-providers`}>
                Known providers
              </label>
              <textarea
                id={`${formId}-known-providers`}
                value={knownProvidersText}
                onChange={(e) => setKnownProvidersText(e.target.value)}
                placeholder={"@provider.a\n@provider.b"}
                rows={5}
                className={`${inputClass} modulr-scrollbar resize-y font-mono text-xs`}
              />
              <label className={`${labelClass} mt-3`} htmlFor={`${formId}-unk-p`}>
                Unknown providers (count)
              </label>
              <input
                id={`${formId}-unk-p`}
                inputMode="numeric"
                value={unknownProviderCount}
                onChange={(e) => setUnknownProviderCount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="modulr-text-muted mt-1 text-[11px]">
                Extra provider slots discovered or assigned by the network. Use <span className="font-mono">0</span> if none.
              </p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Terms of service (module)
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            Use <span className="font-medium text-[var(--modulr-text)]">Markdown</span> — rendered in the catalog and
            linked from your listing. Terms bind{" "}
            <span className="font-medium text-[var(--modulr-text)]">users of your module</span>, distinct from
            Modulr&apos;s own terms. A sample scaffold is prefilled below; replace with counsel-approved text.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <label className={labelClass} htmlFor={`${formId}-tos`}>
              Module ToS (Markdown)
            </label>
            <div className="flex gap-2" role="group" aria-label="Editor view">
              <button
                type="button"
                onClick={() => setTosView("edit")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tosView === "edit"
                    ? "border-[var(--modulr-accent)] bg-[var(--modulr-accent)]/15 text-[var(--modulr-text)]"
                    : "border-[var(--modulr-glass-border)] text-[var(--modulr-text-muted)] hover:text-[var(--modulr-text)]"
                }`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setTosView("preview")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tosView === "preview"
                    ? "border-[var(--modulr-accent)] bg-[var(--modulr-accent)]/15 text-[var(--modulr-text)]"
                    : "border-[var(--modulr-glass-border)] text-[var(--modulr-text-muted)] hover:text-[var(--modulr-text)]"
                }`}
              >
                Preview
              </button>
            </div>
          </div>
          {tosView === "edit" ? (
            <textarea
              id={`${formId}-tos`}
              value={termsOfService}
              onChange={(e) => setTermsOfService(e.target.value)}
              spellCheck={false}
              rows={14}
              className={`${inputClass} modulr-scrollbar resize-y min-h-[12rem] font-mono text-[12px] leading-relaxed`}
            />
          ) : (
            <div
              className="modulr-scrollbar mt-1.5 max-h-[min(70vh,28rem)] min-h-[12rem] overflow-y-auto rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4"
              role="region"
              aria-label="Rendered Markdown preview"
              dangerouslySetInnerHTML={{ __html: tosPreviewHtml }}
            />
          )}
        </GlassPanel>

        <GlassPanel className="border-[var(--modulr-accent)]/25 bg-[color-mix(in_srgb,var(--modulr-accent)_6%,transparent)] p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Modulr certification &amp; MTR credits
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            After an audit, certified modules can participate in the{" "}
            <span className="font-medium text-[var(--modulr-text)]">MTR credit</span> system. We need confidence that
            credits reflect <span className="font-medium text-[var(--modulr-text)]">real service usage</span> — not
            informal transfers. <span className="font-medium text-[var(--modulr-text)]">Audit and certification fees</span>{" "}
            apply (quoted during review; not billed in this preview).
          </p>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 p-4">
            <input
              type="checkbox"
              checked={certificationRequested}
              onChange={(e) => setCertificationRequested(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--modulr-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--modulr-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--modulr-page-bg)]"
            />
            <span>
              <span className="text-sm font-semibold text-[var(--modulr-text)]">
                Request Modulr certification audit
              </span>
              <span className="modulr-text-muted mt-1 block text-xs leading-relaxed">
                Scope, timeline, and fee schedule will be shared before work begins. MTR integration unlocks only after
                certification passes.
              </span>
            </span>
          </label>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Packages &amp; codebases
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            Separate artifacts for who they serve: <span className="font-medium text-[var(--modulr-text)]">clients</span>{" "}
            consume the module, <span className="font-medium text-[var(--modulr-text)]">providers</span> supply work or
            capacity into it, and <span className="font-medium text-[var(--modulr-text)]">routers</span> (validators) speak
            the wire to the rest of the network. Each can iterate on its own release cadence.
          </p>
          <div className="mt-6 space-y-5">
            <PackageRow
              title="Client"
              subtitle="Apps and SDKs for people using the service."
              fileName={archiveClient}
              onFile={(name) => setArchiveClient(name)}
            />
            <PackageRow
              title="Provider"
              subtitle="Operators and workers that fulfill or host offerings."
              fileName={archiveProvider}
              onFile={(name) => setArchiveProvider(name)}
            />
            <PackageRow
              title="Router"
              subtitle="Network validators / routers — interoperability with Modulr wire."
              fileName={archiveRouter}
              onFile={(name) => setArchiveRouter(name)}
            />
          </div>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-8">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setDocsOpen(!docsOpen)}
            aria-expanded={docsOpen}
          >
            <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
              Integration &amp; expectations
            </h2>
            <span className="text-[var(--modulr-accent)] text-sm font-semibold">{docsOpen ? "Hide" : "Show"}</span>
          </button>
          {docsOpen ? (
            <div className="modulr-text-muted mt-4 space-y-4 text-sm leading-relaxed">
              <p>
                <span className="font-medium text-[var(--modulr-text)]">Core &amp; wire.</span> Modules talk to
                Modulr.Core through the stable wire surface (e.g. POST{" "}
                <span className="font-mono text-xs">/message</span>
                ), method catalog entries, and typed payloads. Your builds should declare the methods you expose and
                respect versioned contracts — use{" "}
                <span className="font-medium text-[var(--modulr-text)]">Methods</span> in this shell for catalog QA.
              </p>
              <p>
                <span className="font-medium text-[var(--modulr-text)]">Heartbeat &amp; cadence.</span> Long-running
                workers should emit health/heartbeat signals at an agreed interval so routing and discovery stay accurate.
              </p>
              <p>
                <span className="font-medium text-[var(--modulr-text)]">SDKs &amp; distribution.</span> Python toward{" "}
                <span className="font-mono text-xs">PyPI</span>;{" "}
                <span className="font-medium text-[var(--modulr-text)]">npm / TypeScript next</span> for web clients.
                Other languages as ecosystems mature; long-term Sudo and unified runtime plans still apply.
              </p>
              <p className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4 text-xs">
                Stub for the full &quot;Integrating with Modulr.Core&quot; handbook — link from here when published.
              </p>
            </div>
          ) : null}
        </GlassPanel>

        <GlassPanel className="border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-6 sm:p-8">
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">
            Estimated cost (Modulr)
          </h2>
          <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
            Illustrative numbers only — final fees, taxes, and any hold appear on the quote before you sign. Your own
            subscription or usage prices are separate (see listed price &amp; billing notes). Amounts are shown in{" "}
            <span className="font-medium text-[var(--modulr-text)]">USD</span> for now; a wallet / account currency in{" "}
            <span className="font-medium text-[var(--modulr-text)]">Settings</span> will drive display and settlement
            later.
          </p>
          <ul className="mt-5 divide-y divide-[var(--modulr-glass-border)] rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)]/30">
            {estimateRows.rows.map((row) => (
              <li key={row.label} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--modulr-text)]">{row.label}</p>
                  {row.detail ? <p className="modulr-text-muted mt-0.5 text-xs">{row.detail}</p> : null}
                </div>
                <p className="font-mono text-sm font-semibold text-[var(--modulr-accent)]">{row.amount}</p>
              </li>
            ))}
            <li className="flex flex-wrap items-baseline justify-between gap-2 bg-[var(--modulr-accent)]/10 px-4 py-3">
              <p className="text-sm font-bold text-[var(--modulr-text)]">{estimateRows.subtotalLabel}</p>
              <p className="font-mono text-sm font-bold text-[var(--modulr-text)]">{estimateRows.subtotal}</p>
            </li>
          </ul>
          <p className="modulr-text-muted mt-4 text-[11px] leading-relaxed">
            Wire egress, storage, and third-party charges may apply separately once the module is live — those will ship
            in the billing estimator.
          </p>
        </GlassPanel>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[var(--modulr-accent)] px-10 text-sm font-bold text-[var(--modulr-accent-contrast)] shadow-[0_8px_28px_rgba(255,183,0,0.25)] transition-opacity hover:opacity-95"
          >
            Submit for review (preview)
          </button>
          {submitNote ? <p className="max-w-xl text-xs text-[var(--modulr-text-muted)]">{submitNote}</p> : null}
        </div>
      </form>

      {publishToast ? (
        <div
          role="alert"
          aria-live={publishToast.level === "error" ? "assertive" : "polite"}
          className={`modulr-toast fixed bottom-6 left-1/2 z-[90] max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-solid px-4 py-3 text-center text-sm font-semibold shadow-[0_12px_40px_rgba(0,0,0,0.2),inset_0_1px_0_var(--modulr-glass-highlight)] ${toastSurfaceClass(publishToast.level)}`}
        >
          {publishToast.message}
        </div>
      ) : null}
    </div>
  );
}

function PackageRow({
  title,
  subtitle,
  fileName,
  onFile,
}: {
  title: string;
  subtitle: string;
  fileName: string | null;
  onFile: (name: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/10 p-4">
      <p className="text-sm font-bold text-[var(--modulr-accent)]">{title}</p>
      <p className="modulr-text-muted mt-0.5 text-xs leading-relaxed">{subtitle}</p>
      <label
        className="mt-3 flex cursor-pointer flex-col rounded-lg border border-dashed border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)]/30 px-3 py-6 text-center hover:border-[var(--modulr-accent)]/35"
      >
        <span className="text-xs font-semibold text-[var(--modulr-text)]">Choose archive (.zip / .tar.gz)</span>
        {fileName ? (
          <span className="modulr-text-muted mt-2 font-mono text-[11px] text-[var(--modulr-text)]">
            Selected: {fileName}
          </span>
        ) : (
          <span className="modulr-text-muted mt-2 text-[11px]">No file</span>
        )}
        <input
          type="file"
          accept=".zip,.tar,.gz,.tgz"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0]?.name ?? null)}
        />
      </label>
    </div>
  );
}
