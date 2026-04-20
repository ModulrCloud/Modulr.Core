"use client";

import { GlassPanel } from "@/components/shell/GlassPanel";

import { formatMockUsd, type RegistrationPriceQuote } from "./mockRegistrationPricing";
import type { MockAvailStatus } from "./useMockAvailability";

export const registerInputClass =
  "mt-1 w-full max-w-xl rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2.5 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";

export function previewNameClass(): string {
  return "break-words text-lg font-semibold leading-snug text-[var(--modulr-accent)] [overflow-wrap:anywhere]";
}

export function AvailabilityStrip({ status }: { status: MockAvailStatus }) {
  if (status === "idle_invalid") return null;

  const base =
    "mt-6 rounded-xl border px-4 py-3 text-sm leading-relaxed transition-colors duration-200";

  if (status === "pending") {
    return (
      <div
        className={`${base} border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 text-[var(--modulr-text-muted)]`}
        role="status"
        aria-live="polite"
      >
        <span className="font-medium text-[var(--modulr-text)]">Waiting</span> — pause typing for
        about a second; availability checks run automatically (mock Core round-trip).
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div
        className={`${base} border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-[var(--modulr-text)]`}
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <span
            className="inline-block size-2 animate-pulse rounded-full bg-[var(--modulr-accent)]"
            aria-hidden
          />
          Checking availability…
        </span>
      </div>
    );
  }

  if (status === "available") {
    return (
      <div
        className={`${base} border-[color:var(--modulr-status-success-border)] bg-[color:var(--modulr-status-success-bg)] text-[color:var(--modulr-status-success-fg)]`}
        role="status"
        aria-live="polite"
      >
        <span className="font-semibold">Available</span> — this key looks free in the mock registry.
        You can continue.
      </div>
    );
  }

  return (
    <div
      className={`${base} border-[color:var(--modulr-status-warn-border)] bg-[color:var(--modulr-status-warn-bg)] text-[color:var(--modulr-status-warn-fg)]`}
      role="status"
      aria-live="polite"
    >
      <span className="font-medium">Already registered</span> — try another key (deterministic mock;
      some names always show as taken).
    </div>
  );
}

export function PriceBlock({
  quote,
  previewVariant,
}: {
  quote: RegistrationPriceQuote;
  previewVariant: "name" | "org";
}) {
  if (!quote.normalized && !quote.hint) {
    return (
      <p className="modulr-text-muted mt-4 text-sm tabular-nums">Enter a value to see a mock quote.</p>
    );
  }
  if (!quote.valid) {
    return (
      <div className="mt-4 space-y-2">
        {quote.normalized ? (
          <p className="text-sm text-[var(--modulr-text)]">
            Preview:{" "}
            {previewVariant === "name" ? (
              <span className={previewNameClass()}>{quote.normalized}</span>
            ) : (
              <span className="font-mono font-medium text-[var(--modulr-accent)]">{quote.normalized}</span>
            )}
          </p>
        ) : null}
        {quote.hint ? (
          <p className="text-sm text-amber-600/90 dark:text-amber-400/90">{quote.hint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-[var(--modulr-text)]">
        Registers as{" "}
        {previewVariant === "name" ? (
          <span className={previewNameClass()}>{quote.normalized}</span>
        ) : (
          <span className="font-mono font-semibold text-[var(--modulr-accent)]">{quote.normalized}</span>
        )}
      </p>
      {quote.graphemeCount != null ? (
        <p className="text-xs text-[var(--modulr-text-muted)]">
          Quote uses <span className="font-medium text-[var(--modulr-text)]">{quote.graphemeCount}</span>{" "}
          grapheme{quote.graphemeCount === 1 ? "" : "s"} — single-character names include a large
          premium line item.
        </p>
      ) : null}
      <ul className="max-w-md space-y-1.5 text-sm text-[var(--modulr-text-muted)]">
        {quote.lines.map((line) => (
          <li key={line.label} className="flex justify-between gap-4">
            <span>{line.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--modulr-text)]">
              {formatMockUsd(line.amount)}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-[var(--modulr-glass-border)] pt-3 text-base font-semibold tabular-nums text-[var(--modulr-text)]">
        Estimated total{" "}
        <span className="text-[var(--modulr-accent)]">{formatMockUsd(quote.total)}</span>
        <span className="ml-2 text-xs font-normal text-[var(--modulr-text-muted)]">(mock)</span>
      </p>
      {quote.hint ? <p className="text-xs leading-relaxed text-[var(--modulr-text-muted)]">{quote.hint}</p> : null}
    </div>
  );
}

export function RegisterFormSection({
  idPrefix,
  title,
  description,
  label,
  placeholder,
  value,
  onChange,
  quote,
  previewVariant,
  availability,
  onMockSubmit,
  submitNote,
  submitLabel = "Continue to register (mock)",
}: {
  idPrefix: string;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  quote: RegistrationPriceQuote;
  previewVariant: "name" | "org";
  availability: MockAvailStatus;
  onMockSubmit: () => void;
  submitNote: string | null;
  submitLabel?: string;
}) {
  const inputId = `${idPrefix}-input`;
  const canSubmit = quote.valid && availability === "available";

  let actionHint: string | null = null;
  if (quote.valid) {
    if (availability === "pending") {
      actionHint = "Pause typing — availability checks after ~1s idle.";
    } else if (availability === "checking") {
      actionHint = "Checking availability…";
    } else if (availability === "taken") {
      actionHint = "Choose a different key to continue.";
    } else if (availability === "idle_invalid") {
      actionHint = null;
    }
  } else {
    actionHint = "Enter a valid key to see pricing and availability.";
  }

  return (
    <GlassPanel className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">{title}</h2>
          <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">{description}</p>
        </div>
        <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1 text-xs font-medium text-[var(--modulr-text-muted)]">
          Mock quote
        </span>
      </div>

      <label className="mt-6 block text-xs font-medium text-[var(--modulr-text-muted)]" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={registerInputClass}
        autoComplete="off"
        spellCheck={false}
      />

      <PriceBlock quote={quote} previewVariant={previewVariant} />

      <AvailabilityStrip status={availability} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onMockSubmit}
          className="rounded-lg bg-[var(--modulr-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--modulr-accent-contrast)] shadow-md transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSubmit}
        >
          {submitLabel}
        </button>
        {actionHint ? (
          <span className="text-xs text-[var(--modulr-text-muted)]">{actionHint}</span>
        ) : null}
      </div>

      {submitNote ? (
        <p
          className="mt-4 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)]"
          role="status"
        >
          {submitNote}
        </p>
      ) : null}
    </GlassPanel>
  );
}
